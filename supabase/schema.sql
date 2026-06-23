-- Supabase schema for K-Teacher Jobs.
-- Run this in Supabase SQL Editor before migrating Airtable data.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.institutions (
  id bigint generated always as identity primary key,
  airtable_record_id text unique,
  institution_id text,
  inst_id text,
  slug text,
  name_ko text,
  name_en text,
  name text,
  institution_type text,
  type text,
  country text,
  city text,
  region text,
  website text,
  description text,
  "desc" text,
  verified boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists institutions_public_slug_unique
  on public.institutions ((coalesce(institution_id, inst_id, slug)))
  where coalesce(institution_id, inst_id, slug) is not null;

drop trigger if exists institutions_set_updated_at on public.institutions;
create trigger institutions_set_updated_at
before update on public.institutions
for each row execute function public.set_updated_at();

create table if not exists public.jobs (
  id bigint generated always as identity primary key,
  airtable_record_id text unique,
  institution_airtable_record_id text,
  institution_slug text,
  institution text,
  title text not null default '',
  original_title text,
  country text,
  region text,
  institution_type text,
  employment_type text,
  job_category text,
  work_mode text,
  salary_text text,
  salary_disclosed boolean not null default false,
  cert_required text,
  degree_required text,
  experience_required text,
  visa_support text,
  deadline date,
  posted_date date,
  status text,
  description text,
  qualifications text,
  preferred text,
  how_to_apply text,
  application_url text,
  quality_badges text[] not null default '{}'::text[],
  source_url text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_deadline_idx on public.jobs (deadline);
create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_institution_slug_idx on public.jobs (institution_slug);

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at
before update on public.jobs
for each row execute function public.set_updated_at();

create table if not exists public.events (
  id bigint generated always as identity primary key,
  airtable_record_id text unique,
  title text not null default '',
  organizer text,
  host text,
  event_date date,
  event_end_date date,
  location text,
  venue text,
  format text,
  event_format text,
  registration_deadline date,
  deadline date,
  registration_url text,
  url text,
  description text,
  status text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_event_date_idx on public.events (event_date);
create index if not exists events_status_idx on public.events (status);

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

alter table public.institutions enable row level security;
alter table public.jobs enable row level security;
alter table public.events enable row level security;

grant usage on schema public to service_role;
grant all on table public.institutions to service_role;
grant all on table public.jobs to service_role;
grant all on table public.events to service_role;
grant usage, select on all sequences in schema public to service_role;

grant usage on schema public to anon, authenticated;
grant select on table public.institutions to anon, authenticated;
grant select on table public.jobs to anon, authenticated;
grant select on table public.events to anon, authenticated;

drop policy if exists "Public read institutions" on public.institutions;
create policy "Public read institutions"
on public.institutions
for select
to anon, authenticated
using (true);

drop policy if exists "Public read jobs" on public.jobs;
create policy "Public read jobs"
on public.jobs
for select
to anon, authenticated
using (true);

drop policy if exists "Public read events" on public.events;
create policy "Public read events"
on public.events
for select
to anon, authenticated
using (true);
