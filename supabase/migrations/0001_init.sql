-- ============================================================================
-- 0001_init.sql -- Resume Compatibility & Job Match Engine
-- Schema + Row Level Security + Storage policies + helper functions + admin views
--
-- Design notes
-- ------------
-- * Every table has RLS ENABLED. There are no "public" tables: the anon role can
--   read nothing except through the API layer.
-- * `public.is_admin()` reads the *signed* JWT claim `app_metadata.role`. Users
--   cannot write `app_metadata` themselves -- it is only settable with the
--   service-role key (see scripts/make-admin.ts).
-- * `admin_audit_logs` is append-only: an UPDATE/DELETE trigger raises an
--   exception and no UPDATE/DELETE policies exist.
-- * admin_audit_logs.admin_user_id is ON DELETE RESTRICT on purpose. An admin
--   account that has produced audit rows cannot simply be deleted -- the rows are
--   the accountability record. Operational procedure: before deleting an admin
--   account, (a) export the rows, (b) transfer ownership by inserting a
--   compensating "ACCOUNT_ANONYMIZED" row into analytics_events with user_id
--   NULL (no PII), or (c) reassign rows to a successor admin id with the service
--   role. The self-service route /api/account refuses to delete ADMIN users and
--   returns HTTP 409 with an explanation.
-- ============================================================================

create extension if not exists pgcrypto;      -- gen_random_uuid()
create extension if not exists "uuid-ossp";   -- uuid_generate_v4() for legacy tooling

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  status varchar(16) not null default 'active'
    check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  filename varchar(255) not null,
  storage_key varchar(512) not null,
  file_type varchar(50) not null,
  file_size_bytes int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.resume_versions (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null references public.resumes (id) on delete cascade,
  version_number int not null,
  label varchar(128),
  extracted_data jsonb not null,
  raw_text_length int,
  extraction_method varchar(32),
  ats_metrics jsonb,
  created_at timestamptz not null default now(),
  constraint resume_versions_resume_id_version_number_key unique (resume_id, version_number),
  constraint resume_versions_version_number_positive check (version_number > 0)
);

create table if not exists public.job_descriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title varchar(255) not null,
  company_name varchar(255),
  raw_text text not null,
  structured_data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  resume_version_id uuid not null references public.resume_versions (id) on delete cascade,
  job_description_id uuid not null references public.job_descriptions (id) on delete cascade,
  overall_score numeric(5, 2) not null,
  job_match_score numeric(5, 2) not null,
  ats_score numeric(5, 2) not null,
  skill_score numeric(5, 2) not null,
  score_breakdown jsonb not null,
  recommendations jsonb not null,
  weight_profile varchar(64) not null default 'software_engineer',
  processing_ms int,
  created_at timestamptz not null default now()
);

create table if not exists public.extracted_skills (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  skill_name varchar(128) not null,
  match_category varchar(64) not null,
  cosine_similarity numeric(4, 3),
  evidence_found boolean default false,
  created_at timestamptz not null default now()
);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type varchar(128) not null,
  user_id uuid references auth.users (id) on delete set null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users (id) on delete restrict,
  action varchar(128) not null,
  resource_type varchar(64) not null,
  resource_id uuid,
  status_code int not null,
  ip_address inet,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. Indexes
-- ----------------------------------------------------------------------------

create index if not exists profiles_status_idx on public.profiles (status);
create index if not exists profiles_created_at_idx on public.profiles (created_at desc);

create index if not exists resumes_user_id_idx on public.resumes (user_id);
create index if not exists resumes_created_at_idx on public.resumes (created_at desc);
create index if not exists resumes_user_id_deleted_at_idx on public.resumes (user_id, deleted_at);

create index if not exists resume_versions_resume_id_idx on public.resume_versions (resume_id);
create index if not exists resume_versions_created_at_idx on public.resume_versions (created_at desc);

create index if not exists job_descriptions_user_id_idx on public.job_descriptions (user_id);
create index if not exists job_descriptions_created_at_idx on public.job_descriptions (created_at desc);

create index if not exists analyses_user_id_idx on public.analyses (user_id);
create index if not exists analyses_created_at_idx on public.analyses (created_at desc);
create index if not exists analyses_resume_version_id_idx on public.analyses (resume_version_id);
create index if not exists analyses_job_description_id_idx on public.analyses (job_description_id);

create index if not exists extracted_skills_analysis_id_idx on public.extracted_skills (analysis_id);
create index if not exists extracted_skills_match_category_idx on public.extracted_skills (match_category);

create index if not exists analytics_events_event_type_idx on public.analytics_events (event_type);
create index if not exists analytics_events_user_id_idx on public.analytics_events (user_id);
create index if not exists analytics_events_created_at_idx on public.analytics_events (created_at desc);

create index if not exists admin_audit_logs_admin_user_id_idx on public.admin_audit_logs (admin_user_id);
create index if not exists admin_audit_logs_action_idx on public.admin_audit_logs (action);
create index if not exists admin_audit_logs_created_at_idx on public.admin_audit_logs (created_at desc);

-- ----------------------------------------------------------------------------
-- 3. Helper functions
-- ----------------------------------------------------------------------------

-- Reads the role claim from the JWT. Returns false for anon/unauthenticated.
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

comment on function public.is_admin() is
  'True when the current JWT carries app_metadata.role = ''admin''. app_metadata is only writable with the service-role key.';

-- Keep resumes.updated_at honest.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists resumes_set_updated_at on public.resumes;
create trigger resumes_set_updated_at
  before update on public.resumes
  for each row execute function public.set_updated_at();

-- Auto-provision a profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, status)
  values (new.id, new.email, 'active')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Append-only enforcement for the audit log.
create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'admin_audit_logs is append-only (attempted %)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists admin_audit_logs_immutable_update on public.admin_audit_logs;
create trigger admin_audit_logs_immutable_update
  before update on public.admin_audit_logs
  for each row execute function public.prevent_audit_mutation();

drop trigger if exists admin_audit_logs_immutable_delete on public.admin_audit_logs;
create trigger admin_audit_logs_immutable_delete
  before delete on public.admin_audit_logs
  for each row execute function public.prevent_audit_mutation();

-- ----------------------------------------------------------------------------
-- 4. Row Level Security
-- ----------------------------------------------------------------------------

alter table public.profiles          enable row level security;
alter table public.resumes           enable row level security;
alter table public.resume_versions   enable row level security;
alter table public.job_descriptions  enable row level security;
alter table public.analyses          enable row level security;
alter table public.extracted_skills  enable row level security;
alter table public.analytics_events  enable row level security;
alter table public.admin_audit_logs  enable row level security;

-- Force RLS for table owners too (defence in depth).
alter table public.profiles          force row level security;
alter table public.resumes           force row level security;
alter table public.resume_versions   force row level security;
alter table public.job_descriptions  force row level security;
alter table public.analyses          force row level security;
alter table public.extracted_skills  force row level security;
alter table public.analytics_events  force row level security;
alter table public.admin_audit_logs  force row level security;

-- ---- profiles --------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (public.is_admin());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---- resumes ---------------------------------------------------------------
drop policy if exists resumes_owner_all on public.resumes;
create policy resumes_owner_all on public.resumes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists resumes_admin_select on public.resumes;
create policy resumes_admin_select on public.resumes
  for select to authenticated
  using (public.is_admin());

-- ---- job_descriptions ------------------------------------------------------
drop policy if exists job_descriptions_owner_all on public.job_descriptions;
create policy job_descriptions_owner_all on public.job_descriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists job_descriptions_admin_select on public.job_descriptions;
create policy job_descriptions_admin_select on public.job_descriptions
  for select to authenticated
  using (public.is_admin());

-- ---- analyses --------------------------------------------------------------
drop policy if exists analyses_owner_all on public.analyses;
create policy analyses_owner_all on public.analyses
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists analyses_admin_select on public.analyses;
create policy analyses_admin_select on public.analyses
  for select to authenticated
  using (public.is_admin());

-- ---- resume_versions (inherits access from parent resume) ------------------
drop policy if exists resume_versions_owner_all on public.resume_versions;
create policy resume_versions_owner_all on public.resume_versions
  for all to authenticated
  using (
    exists (
      select 1 from public.resumes r
      where r.id = resume_versions.resume_id
        and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.resumes r
      where r.id = resume_versions.resume_id
        and r.user_id = auth.uid()
    )
  );

drop policy if exists resume_versions_admin_select on public.resume_versions;
create policy resume_versions_admin_select on public.resume_versions
  for select to authenticated
  using (public.is_admin());

-- ---- extracted_skills (inherits access from parent analysis) ---------------
drop policy if exists extracted_skills_owner_all on public.extracted_skills;
create policy extracted_skills_owner_all on public.extracted_skills
  for all to authenticated
  using (
    exists (
      select 1 from public.analyses a
      where a.id = extracted_skills.analysis_id
        and a.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.analyses a
      where a.id = extracted_skills.analysis_id
        and a.user_id = auth.uid()
    )
  );

drop policy if exists extracted_skills_admin_select on public.extracted_skills;
create policy extracted_skills_admin_select on public.extracted_skills
  for select to authenticated
  using (public.is_admin());

-- ---- analytics_events ------------------------------------------------------
-- Authenticated users may write telemetry for themselves; nobody but an admin
-- can read the stream (prevents cross-tenant inference).
drop policy if exists analytics_events_insert_authenticated on public.analytics_events;
create policy analytics_events_insert_authenticated on public.analytics_events
  for insert to authenticated
  with check (user_id is null or user_id = auth.uid());

drop policy if exists analytics_events_select_admin on public.analytics_events;
create policy analytics_events_select_admin on public.analytics_events
  for select to authenticated
  using (public.is_admin());

-- ---- admin_audit_logs ------------------------------------------------------
-- NOTE: intentionally NO update/delete policies -- the table is immutable.
-- Service-role inserts bypass RLS, which is how logAdminAction() writes.
drop policy if exists admin_audit_logs_select_admin on public.admin_audit_logs;
create policy admin_audit_logs_select_admin on public.admin_audit_logs
  for select to authenticated
  using (public.is_admin());

drop policy if exists admin_audit_logs_insert_service on public.admin_audit_logs;
create policy admin_audit_logs_insert_service on public.admin_audit_logs
  for insert to service_role
  with check (true);

-- ----------------------------------------------------------------------------
-- 5. Storage: private "resumes" bucket, objects namespaced by user id
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes',
  'resumes',
  false,
  10485760, -- 10 MB, mirrors the application-level cap
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Users may only touch objects that live under their own "{auth.uid()}/" prefix.
drop policy if exists resumes_storage_select_own on storage.objects;
create policy resumes_storage_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists resumes_storage_insert_own on storage.objects;
create policy resumes_storage_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists resumes_storage_update_own on storage.objects;
create policy resumes_storage_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists resumes_storage_delete_own on storage.objects;
create policy resumes_storage_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ----------------------------------------------------------------------------
-- 6. Admin telemetry views (security_invoker so RLS still applies to the caller)
-- ----------------------------------------------------------------------------

create or replace view public.admin_daily_metrics
with (security_invoker = true) as
select
  d.day::date                                     as day,
  coalesce(p.registrations, 0)                    as registrations,
  coalesce(r.uploads, 0)                          as uploads,
  coalesce(a.analyses_count, 0)                   as analyses_count
from (
  select generate_series(
    (now() - interval '29 days')::date,
    now()::date,
    interval '1 day'
  )::date as day
) d
left join (
  select created_at::date as day, count(*) as registrations
  from public.profiles
  group by 1
) p on p.day = d.day
left join (
  select created_at::date as day, count(*) as uploads
  from public.resumes
  where deleted_at is null
  group by 1
) r on r.day = d.day
left join (
  select created_at::date as day, count(*) as analyses_count
  from public.analyses
  group by 1
) a on a.day = d.day
order by d.day asc;

create or replace view public.admin_avg_scores
with (security_invoker = true) as
select
  weight_profile,
  count(*)                                    as analysis_count,
  round(avg(overall_score)::numeric, 2)       as avg_overall_score,
  round(avg(job_match_score)::numeric, 2)     as avg_job_match_score,
  round(avg(ats_score)::numeric, 2)           as avg_ats_score,
  round(avg(skill_score)::numeric, 2)         as avg_skill_score,
  round(avg(processing_ms)::numeric, 0)       as avg_processing_ms
from public.analyses
group by weight_profile
order by analysis_count desc;

create or replace view public.admin_failure_counts
with (security_invoker = true) as
select
  event_type,
  created_at::date                            as day,
  count(*)                                    as event_count
from public.analytics_events
where event_type like '%\_failed' escape '\'
   or event_type like '%\_error' escape '\'
group by event_type, created_at::date
order by day desc, event_count desc;

grant select on public.admin_daily_metrics to authenticated;
grant select on public.admin_avg_scores to authenticated;
grant select on public.admin_failure_counts to authenticated;
