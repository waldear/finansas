-- Advanced schema for Finansas
-- Run this after supabase-schema.sql and supabase-copilot.sql

create extension if not exists "pgcrypto";

-- Queue for async document processing
create table if not exists document_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_path text not null,
  original_name text not null,
  mime_type text not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  attempts integer not null default 0,
  error_message text,
  extraction_json jsonb,
  document_id uuid references documents(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_document_jobs_user_status on document_jobs(user_id, status, created_at desc);

-- Audit log for critical financial actions
create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  action text not null check (action in ('create', 'update', 'delete', 'system')),
  before_data jsonb,
  after_data jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_events_user_created on audit_events(user_id, created_at desc);

-- Monthly budgets by category
create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  limit_amount numeric(12,2) not null check (limit_amount > 0),
  alert_threshold integer not null default 80 check (alert_threshold between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_budgets_unique_user_category_month on budgets(user_id, category, month);

-- Recurring transactions rules
create table if not exists recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount numeric(12,2) not null check (amount > 0),
  description text not null,
  category text not null,
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  start_date date not null,
  next_run date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_recurring_user_next_run on recurring_transactions(user_id, next_run) where is_active = true;

-- User entitlements for plans (free/pro)
create table if not exists user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  status text not null default 'active' check (status in ('active', 'trialing', 'past_due', 'canceled', 'inactive')),
  provider text not null default 'none' check (provider in ('none', 'app_store', 'play_store', 'stripe', 'admin')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  assistant_monthly_request_limit integer not null default 40 check (assistant_monthly_request_limit >= 0),
  assistant_hard_block boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_entitlements_plan_status on user_entitlements(plan, status);

-- Assistant usage tracking for quotas/billing
create table if not exists assistant_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  plan text not null check (plan in ('free', 'pro')),
  status text not null check (status in ('completed', 'blocked', 'failed')),
  model text,
  prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
  completion_tokens integer not null default 0 check (completion_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  blocked_reason text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  unique (request_id)
);

create index if not exists idx_assistant_usage_user_created on assistant_usage_events(user_id, created_at desc);
create index if not exists idx_assistant_usage_user_status_created on assistant_usage_events(user_id, status, created_at desc);

-- Billing events to connect App Store / Play Store webhooks in future
create table if not exists billing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  provider text not null check (provider in ('app_store', 'play_store', 'stripe', 'admin')),
  external_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  processed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (provider, external_event_id)
);

create index if not exists idx_billing_events_processed_created on billing_events(processed, created_at desc);

-- Enable RLS
alter table if exists document_jobs enable row level security;
alter table if exists audit_events enable row level security;
alter table if exists budgets enable row level security;
alter table if exists recurring_transactions enable row level security;
alter table if exists user_entitlements enable row level security;
alter table if exists assistant_usage_events enable row level security;
alter table if exists billing_events enable row level security;

-- Policies: document_jobs
drop policy if exists "Users can view their own document jobs" on document_jobs;
create policy "Users can view their own document jobs" on document_jobs
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own document jobs" on document_jobs;
create policy "Users can insert their own document jobs" on document_jobs
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own document jobs" on document_jobs;
create policy "Users can update their own document jobs" on document_jobs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Policies: audit_events
drop policy if exists "Users can view their own audit events" on audit_events;
create policy "Users can view their own audit events" on audit_events
  for select using (auth.uid() = user_id);

drop policy if exists "System can insert audit events for user" on audit_events;
create policy "System can insert audit events for user" on audit_events
  for insert with check (auth.uid() = user_id);

-- Policies: budgets
drop policy if exists "Users can view their own budgets" on budgets;
create policy "Users can view their own budgets" on budgets
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own budgets" on budgets;
create policy "Users can insert their own budgets" on budgets
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own budgets" on budgets;
create policy "Users can update their own budgets" on budgets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own budgets" on budgets;
create policy "Users can delete their own budgets" on budgets
  for delete using (auth.uid() = user_id);

-- Policies: recurring_transactions
drop policy if exists "Users can view their own recurring transactions" on recurring_transactions;
create policy "Users can view their own recurring transactions" on recurring_transactions
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own recurring transactions" on recurring_transactions;
create policy "Users can insert their own recurring transactions" on recurring_transactions
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own recurring transactions" on recurring_transactions;
create policy "Users can update their own recurring transactions" on recurring_transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own recurring transactions" on recurring_transactions;
create policy "Users can delete their own recurring transactions" on recurring_transactions
  for delete using (auth.uid() = user_id);

-- Policies: user_entitlements
drop policy if exists "Users can view their own entitlements" on user_entitlements;
create policy "Users can view their own entitlements" on user_entitlements
  for select using (auth.uid() = user_id);

drop policy if exists "Users can bootstrap free entitlement" on user_entitlements;
create policy "Users can bootstrap free entitlement" on user_entitlements
  for insert with check (
    auth.uid() = user_id
    and plan = 'free'
    and status = 'active'
    and provider = 'none'
    and assistant_hard_block = false
  );

-- Policies: assistant_usage_events
drop policy if exists "Users can view their own assistant usage" on assistant_usage_events;
create policy "Users can view their own assistant usage" on assistant_usage_events
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own assistant usage" on assistant_usage_events;
create policy "Users can insert their own assistant usage" on assistant_usage_events
  for insert with check (auth.uid() = user_id);

-- Ensure storage bucket exists and is private
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Replace storage policies with deterministic names
drop policy if exists "Users can upload documents" on storage.objects;
drop policy if exists "Users can view their own documents" on storage.objects;
drop policy if exists "Users can update their own documents" on storage.objects;
drop policy if exists "Users can delete their own documents" on storage.objects;

create policy "Users can upload documents" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and auth.uid() = (storage.foldername(name))[1]::uuid
  );

create policy "Users can view their own documents" on storage.objects
  for select using (
    bucket_id = 'documents'
    and auth.uid() = (storage.foldername(name))[1]::uuid
  );

create policy "Users can update their own documents" on storage.objects
  for update using (
    bucket_id = 'documents'
    and auth.uid() = (storage.foldername(name))[1]::uuid
  ) with check (
    bucket_id = 'documents'
    and auth.uid() = (storage.foldername(name))[1]::uuid
  );

create policy "Users can delete their own documents" on storage.objects
  for delete using (
    bucket_id = 'documents'
    and auth.uid() = (storage.foldername(name))[1]::uuid
  );
