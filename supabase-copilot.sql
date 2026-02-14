-- Create documents table
create type document_type as enum ('bank_statement', 'credit_card', 'invoice', 'other');
create type document_status as enum ('processing', 'processed', 'error');

create table documents (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  url text not null,
  type document_type not null default 'other',
  status document_status not null default 'processing',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create extractions table
create table extractions (
  id uuid default gen_random_uuid() primary key,
  document_id uuid references documents(id) on delete cascade not null,
  raw_json jsonb,
  confidence_score float,
  manual_verification_needed boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create obligations table
create type obligation_status as enum ('pending', 'paid', 'overdue');

create table obligations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  extraction_id uuid references extractions(id),
  title text not null,
  amount decimal(10, 2) not null,
  due_date date not null,
  status obligation_status not null default 'pending',
  category text,
  minimum_payment decimal(10, 2),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create recommendations table
create type risk_level as enum ('low', 'medium', 'high');
create type profile_type as enum ('defensive', 'balanced', 'accelerated');

create table recommendations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  week_cycle date not null,
  risk_level risk_level,
  actions jsonb,
  profile_type profile_type,
  is_dismissed boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table documents enable row level security;
alter table extractions enable row level security;
alter table obligations enable row level security;
alter table recommendations enable row level security;

-- Create policies
create policy "Users can view their own documents" on documents
  for select using (auth.uid() = user_id);

create policy "Users can insert their own documents" on documents
  for insert with check (auth.uid() = user_id);

create policy "Users can view extractions for their documents" on extractions
  for select using (
    exists (
      select 1 from documents
      where documents.id = extractions.document_id
      and documents.user_id = auth.uid()
    )
  );

create policy "Users can view their own obligations" on obligations
  for select using (auth.uid() = user_id);

create policy "Users can insert their own obligations" on obligations
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own obligations" on obligations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can delete their own obligations" on obligations
  for delete using (auth.uid() = user_id);

create policy "Users can view their own recommendations" on recommendations
  for select using (auth.uid() = user_id);

-- Storage bucket for documents
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "Users can upload documents" on storage.objects
  for insert with check (
    bucket_id = 'documents' and
    auth.uid() = (storage.foldername(name))[1]::uuid
  );

create policy "Users can view their own documents" on storage.objects
  for select using (
    bucket_id = 'documents' and
    auth.uid() = (storage.foldername(name))[1]::uuid
  );
