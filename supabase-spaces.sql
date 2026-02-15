-- Spaces / Familia (Workspaces compartidos)
-- Ejecutar DESPUES de:
-- 1) supabase-schema.sql
-- 2) supabase-copilot.sql
-- 3) supabase-advanced.sql

create extension if not exists "pgcrypto";

-- ============================================================
-- Core tables
-- ============================================================

create table if not exists spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'personal' check (type in ('personal', 'family')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'update_spaces_modtime'
  ) then
    create trigger update_spaces_modtime
    before update on spaces
    for each row
    execute function update_updated_at_column();
  end if;
end $$;

create table if not exists space_members (
  space_id uuid not null references spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create index if not exists idx_space_members_user on space_members(user_id);

create table if not exists space_invites (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  code text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists idx_space_invites_space on space_invites(space_id);

-- ============================================================
-- Helper functions (RLS)
-- ============================================================

create or replace function is_space_member(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from space_members sm
    where sm.space_id = p_space_id
      and sm.user_id = auth.uid()
  );
$$;

create or replace function is_space_admin(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from space_members sm
    where sm.space_id = p_space_id
      and sm.user_id = auth.uid()
      and sm.role in ('owner', 'admin')
  );
$$;

create or replace function is_space_owner(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from space_members sm
    where sm.space_id = p_space_id
      and sm.user_id = auth.uid()
      and sm.role = 'owner'
  );
$$;

-- Accept invite by code (no necesitas service role en la app)
create or replace function accept_space_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
begin
  select si.space_id
  into v_space_id
  from space_invites si
  where si.code = p_code
    and (si.expires_at is null or si.expires_at > now())
  limit 1;

  if v_space_id is null then
    raise exception 'Invite inválido o vencido';
  end if;

  insert into space_members(space_id, user_id, role)
  values (v_space_id, auth.uid(), 'member')
  on conflict (space_id, user_id) do nothing;

  return v_space_id;
end;
$$;

revoke all on function accept_space_invite(text) from public;
grant execute on function accept_space_invite(text) to authenticated;

-- ============================================================
-- Enable RLS + Policies
-- ============================================================

alter table spaces enable row level security;
alter table space_members enable row level security;
alter table space_invites enable row level security;

-- spaces
drop policy if exists "Members can view spaces" on spaces;
create policy "Members can view spaces" on spaces
  for select using (is_space_member(id) or created_by = auth.uid());

drop policy if exists "Users can create spaces" on spaces;
create policy "Users can create spaces" on spaces
  for insert with check (auth.uid() = created_by);

drop policy if exists "Admins can update spaces" on spaces;
create policy "Admins can update spaces" on spaces
  for update using (is_space_admin(id))
  with check (is_space_admin(id));

drop policy if exists "Owners can delete spaces" on spaces;
create policy "Owners can delete spaces" on spaces
  for delete using (is_space_owner(id));

-- space_members
drop policy if exists "Members can view space members" on space_members;
create policy "Members can view space members" on space_members
  for select using (is_space_member(space_id));

drop policy if exists "Admins can insert members" on space_members;
create policy "Admins can insert members" on space_members
  for insert with check (
    is_space_admin(space_id)
    or (
      user_id = auth.uid()
      and role = 'owner'
      and exists (
        select 1 from spaces s
        where s.id = space_id
          and s.created_by = auth.uid()
      )
    )
  );

drop policy if exists "Admins can update members" on space_members;
create policy "Admins can update members" on space_members
  for update using (is_space_admin(space_id))
  with check (is_space_admin(space_id));

drop policy if exists "Admins can delete members or members can leave" on space_members;
create policy "Admins can delete members or members can leave" on space_members
  for delete using (is_space_admin(space_id) or user_id = auth.uid());

-- space_invites
drop policy if exists "Members can view invites" on space_invites;
create policy "Members can view invites" on space_invites
  for select using (is_space_member(space_id));

drop policy if exists "Admins can create invites" on space_invites;
create policy "Admins can create invites" on space_invites
  for insert with check (is_space_admin(space_id));

drop policy if exists "Admins can delete invites" on space_invites;
create policy "Admins can delete invites" on space_invites
  for delete using (is_space_admin(space_id));

-- ============================================================
-- Backfill: create Personal spaces for existing users with data
-- Personal space id == user_id (simplifies migrations + app logic)
-- ============================================================

with users_with_data as (
  select user_id from transactions
  union select user_id from debts
  union select user_id from savings_goals
  union select user_id from budgets
  union select user_id from recurring_transactions
  union select user_id from obligations
  union select user_id from documents
  union select user_id from recommendations
  union select user_id from audit_events
  union select user_id from document_jobs
)
insert into spaces (id, name, type, created_by)
select distinct user_id, 'Personal', 'personal', user_id
from users_with_data
where user_id is not null
on conflict (id) do nothing;

with users_with_data as (
  select user_id from transactions
  union select user_id from debts
  union select user_id from savings_goals
  union select user_id from budgets
  union select user_id from recurring_transactions
  union select user_id from obligations
  union select user_id from documents
  union select user_id from recommendations
  union select user_id from audit_events
  union select user_id from document_jobs
)
insert into space_members(space_id, user_id, role)
select distinct user_id, user_id, 'owner'
from users_with_data
where user_id is not null
on conflict (space_id, user_id) do nothing;

-- ============================================================
-- Add space_id to financial tables (and migrate existing rows)
-- ============================================================

-- transactions
alter table if exists transactions add column if not exists space_id uuid;
update transactions set space_id = user_id where space_id is null;
alter table transactions alter column space_id set not null;
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'transactions' and constraint_name = 'transactions_space_id_fkey'
  ) then
    alter table transactions
      add constraint transactions_space_id_fkey
      foreign key (space_id) references spaces(id) on delete cascade;
  end if;
end $$;
create index if not exists idx_transactions_space_date on transactions(space_id, date desc, created_at desc);

-- debts
alter table if exists debts add column if not exists space_id uuid;
update debts set space_id = user_id where space_id is null;
alter table debts alter column space_id set not null;
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'debts' and constraint_name = 'debts_space_id_fkey'
  ) then
    alter table debts
      add constraint debts_space_id_fkey
      foreign key (space_id) references spaces(id) on delete cascade;
  end if;
end $$;
create index if not exists idx_debts_space_next_payment on debts(space_id, next_payment_date asc);

-- savings_goals
alter table if exists savings_goals add column if not exists space_id uuid;
update savings_goals set space_id = user_id where space_id is null;
alter table savings_goals alter column space_id set not null;
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'savings_goals' and constraint_name = 'savings_goals_space_id_fkey'
  ) then
    alter table savings_goals
      add constraint savings_goals_space_id_fkey
      foreign key (space_id) references spaces(id) on delete cascade;
  end if;
end $$;
create index if not exists idx_savings_goals_space on savings_goals(space_id, created_at desc);

-- budgets
alter table if exists budgets add column if not exists space_id uuid;
update budgets set space_id = user_id where space_id is null;
alter table budgets alter column space_id set not null;
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'budgets' and constraint_name = 'budgets_space_id_fkey'
  ) then
    alter table budgets
      add constraint budgets_space_id_fkey
      foreign key (space_id) references spaces(id) on delete cascade;
  end if;
end $$;
drop index if exists idx_budgets_unique_user_category_month;
create unique index if not exists idx_budgets_unique_space_category_month on budgets(space_id, category, month);

-- recurring_transactions
alter table if exists recurring_transactions add column if not exists space_id uuid;
update recurring_transactions set space_id = user_id where space_id is null;
alter table recurring_transactions alter column space_id set not null;
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'recurring_transactions' and constraint_name = 'recurring_transactions_space_id_fkey'
  ) then
    alter table recurring_transactions
      add constraint recurring_transactions_space_id_fkey
      foreign key (space_id) references spaces(id) on delete cascade;
  end if;
end $$;
create index if not exists idx_recurring_space_next_run on recurring_transactions(space_id, next_run) where is_active = true;

-- audit_events
alter table if exists audit_events add column if not exists space_id uuid;
update audit_events set space_id = user_id where space_id is null;
alter table audit_events alter column space_id set not null;
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'audit_events' and constraint_name = 'audit_events_space_id_fkey'
  ) then
    alter table audit_events
      add constraint audit_events_space_id_fkey
      foreign key (space_id) references spaces(id) on delete cascade;
  end if;
end $$;
create index if not exists idx_audit_events_space_created on audit_events(space_id, created_at desc);

-- documents
alter table if exists documents add column if not exists space_id uuid;
update documents set space_id = user_id where space_id is null;
alter table documents alter column space_id set not null;
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'documents' and constraint_name = 'documents_space_id_fkey'
  ) then
    alter table documents
      add constraint documents_space_id_fkey
      foreign key (space_id) references spaces(id) on delete cascade;
  end if;
end $$;
create index if not exists idx_documents_space_created on documents(space_id, created_at desc);

-- obligations
alter table if exists obligations add column if not exists space_id uuid;
update obligations set space_id = user_id where space_id is null;
alter table obligations alter column space_id set not null;
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'obligations' and constraint_name = 'obligations_space_id_fkey'
  ) then
    alter table obligations
      add constraint obligations_space_id_fkey
      foreign key (space_id) references spaces(id) on delete cascade;
  end if;
end $$;
create index if not exists idx_obligations_space_due on obligations(space_id, due_date asc);

-- recommendations
alter table if exists recommendations add column if not exists space_id uuid;
update recommendations set space_id = user_id where space_id is null;
alter table recommendations alter column space_id set not null;
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'recommendations' and constraint_name = 'recommendations_space_id_fkey'
  ) then
    alter table recommendations
      add constraint recommendations_space_id_fkey
      foreign key (space_id) references spaces(id) on delete cascade;
  end if;
end $$;
create index if not exists idx_recommendations_space_week on recommendations(space_id, week_cycle desc);

-- document_jobs (Copilot async queue)
alter table if exists document_jobs add column if not exists space_id uuid;
update document_jobs set space_id = user_id where space_id is null;
alter table document_jobs alter column space_id set not null;
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'document_jobs' and constraint_name = 'document_jobs_space_id_fkey'
  ) then
    alter table document_jobs
      add constraint document_jobs_space_id_fkey
      foreign key (space_id) references spaces(id) on delete cascade;
  end if;
end $$;
create index if not exists idx_document_jobs_space_status on document_jobs(space_id, status, created_at desc);

-- ============================================================
-- Replace RLS policies on app tables to use space membership
-- ============================================================

-- transactions
drop policy if exists "Users can insert their own transactions" on transactions;
drop policy if exists "Users can view their own transactions" on transactions;
drop policy if exists "Users can update their own transactions" on transactions;
drop policy if exists "Users can delete their own transactions" on transactions;

create policy "Members can view transactions" on transactions
  for select using (is_space_member(space_id));
create policy "Members can insert transactions" on transactions
  for insert with check (is_space_member(space_id));
create policy "Members can update transactions" on transactions
  for update using (is_space_member(space_id)) with check (is_space_member(space_id));
create policy "Members can delete transactions" on transactions
  for delete using (is_space_member(space_id));

-- debts
drop policy if exists "Users can insert their own debts" on debts;
drop policy if exists "Users can view their own debts" on debts;
drop policy if exists "Users can update their own debts" on debts;
drop policy if exists "Users can delete their own debts" on debts;

create policy "Members can view debts" on debts
  for select using (is_space_member(space_id));
create policy "Members can insert debts" on debts
  for insert with check (is_space_member(space_id));
create policy "Members can update debts" on debts
  for update using (is_space_member(space_id)) with check (is_space_member(space_id));
create policy "Members can delete debts" on debts
  for delete using (is_space_member(space_id));

-- savings_goals
drop policy if exists "Users can insert their own goals" on savings_goals;
drop policy if exists "Users can view their own goals" on savings_goals;
drop policy if exists "Users can update their own goals" on savings_goals;
drop policy if exists "Users can delete their own goals" on savings_goals;

create policy "Members can view goals" on savings_goals
  for select using (is_space_member(space_id));
create policy "Members can insert goals" on savings_goals
  for insert with check (is_space_member(space_id));
create policy "Members can update goals" on savings_goals
  for update using (is_space_member(space_id)) with check (is_space_member(space_id));
create policy "Members can delete goals" on savings_goals
  for delete using (is_space_member(space_id));

-- budgets
drop policy if exists "Users can view their own budgets" on budgets;
drop policy if exists "Users can insert their own budgets" on budgets;
drop policy if exists "Users can update their own budgets" on budgets;
drop policy if exists "Users can delete their own budgets" on budgets;

create policy "Members can view budgets" on budgets
  for select using (is_space_member(space_id));
create policy "Members can insert budgets" on budgets
  for insert with check (is_space_member(space_id));
create policy "Members can update budgets" on budgets
  for update using (is_space_member(space_id)) with check (is_space_member(space_id));
create policy "Members can delete budgets" on budgets
  for delete using (is_space_member(space_id));

-- recurring_transactions
drop policy if exists "Users can view their own recurring transactions" on recurring_transactions;
drop policy if exists "Users can insert their own recurring transactions" on recurring_transactions;
drop policy if exists "Users can update their own recurring transactions" on recurring_transactions;
drop policy if exists "Users can delete their own recurring transactions" on recurring_transactions;

create policy "Members can view recurring rules" on recurring_transactions
  for select using (is_space_member(space_id));
create policy "Members can insert recurring rules" on recurring_transactions
  for insert with check (is_space_member(space_id));
create policy "Members can update recurring rules" on recurring_transactions
  for update using (is_space_member(space_id)) with check (is_space_member(space_id));
create policy "Members can delete recurring rules" on recurring_transactions
  for delete using (is_space_member(space_id));

-- audit_events (shared by space)
drop policy if exists "Users can view their own audit events" on audit_events;
drop policy if exists "System can insert audit events for user" on audit_events;

create policy "Members can view audit events" on audit_events
  for select using (is_space_member(space_id));
create policy "Members can insert audit events" on audit_events
  for insert with check (is_space_member(space_id));

-- documents
drop policy if exists "Users can view their own documents" on documents;
drop policy if exists "Users can insert their own documents" on documents;

create policy "Members can view documents" on documents
  for select using (is_space_member(space_id));
create policy "Members can insert documents" on documents
  for insert with check (is_space_member(space_id) and auth.uid() = user_id);

-- extractions (based on documents.space_id)
drop policy if exists "Users can view extractions for their documents" on extractions;
drop policy if exists "Users can insert extractions for their documents" on extractions;
drop policy if exists "Users can update extractions for their documents" on extractions;
drop policy if exists "Users can delete extractions for their documents" on extractions;

create policy "Members can view extractions for documents" on extractions
  for select using (
    exists (
      select 1 from documents
      where documents.id = extractions.document_id
        and is_space_member(documents.space_id)
    )
  );

create policy "Members can insert extractions for documents" on extractions
  for insert with check (
    exists (
      select 1 from documents
      where documents.id = document_id
        and is_space_member(documents.space_id)
    )
  );

create policy "Members can update extractions for documents" on extractions
  for update using (
    exists (
      select 1 from documents
      where documents.id = extractions.document_id
        and is_space_member(documents.space_id)
    )
  ) with check (
    exists (
      select 1 from documents
      where documents.id = extractions.document_id
        and is_space_member(documents.space_id)
    )
  );

create policy "Members can delete extractions for documents" on extractions
  for delete using (
    exists (
      select 1 from documents
      where documents.id = extractions.document_id
        and is_space_member(documents.space_id)
    )
  );

-- obligations
drop policy if exists "Users can view their own obligations" on obligations;
drop policy if exists "Users can insert their own obligations" on obligations;
drop policy if exists "Users can update their own obligations" on obligations;
drop policy if exists "Users can delete their own obligations" on obligations;

create policy "Members can view obligations" on obligations
  for select using (is_space_member(space_id));
create policy "Members can insert obligations" on obligations
  for insert with check (is_space_member(space_id));
create policy "Members can update obligations" on obligations
  for update using (is_space_member(space_id)) with check (is_space_member(space_id));
create policy "Members can delete obligations" on obligations
  for delete using (is_space_member(space_id));

-- recommendations
drop policy if exists "Users can view their own recommendations" on recommendations;
create policy "Members can view recommendations" on recommendations
  for select using (is_space_member(space_id));
