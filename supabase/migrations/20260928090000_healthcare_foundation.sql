create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.provider_verification_status as enum ('draft', 'pending_verification', 'verified', 'suspended', 'archived');
create type public.case_lifecycle_status as enum ('draft', 'intake', 'planning', 'awaiting_patient', 'awaiting_provider', 'in_progress', 'completed', 'cancelled');

create function private.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

create table public.source_records (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null check (source_kind in ('synthetic', 'external', 'first_party')),
  source_name text not null,
  source_url text,
  source_identifier text,
  retrieved_at timestamptz,
  effective_from date,
  effective_until date,
  extraction_method text,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  check (effective_until is null or effective_from is null or effective_until >= effective_from),
  check (source_kind <> 'synthetic' or verification_status <> 'verified')
);

create table public.countries (
  id uuid primary key default gen_random_uuid(), slug text not null unique, iso_code char(2) not null unique,
  name text not null, description text not null default '', aliases text[] not null default '{}',
  travel_note text not null default '', source_kind text not null check (source_kind in ('synthetic', 'external', 'first_party')),
  publication_status text not null default 'draft' check (publication_status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.cities (
  id uuid primary key default gen_random_uuid(), country_id uuid not null references public.countries(id),
  slug text not null, name text not null, aliases text[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (country_id, slug)
);
create table public.specialties (
  id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null unique,
  aliases text[] not null default '{}', source_kind text not null default 'synthetic' check (source_kind in ('synthetic', 'external', 'first_party')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.conditions (
  id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null,
  aliases text[] not null default '{}', source_kind text not null check (source_kind in ('synthetic', 'external', 'first_party')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.treatments (
  id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null,
  specialty_id uuid not null references public.specialties(id), category text not null,
  description text not null, aliases text[] not null default '{}', overview text not null,
  procedure_summary text not null, indications text not null, diagnostics text not null, recovery text not null,
  typical_stay_days integer check (typical_stay_days > 0), faqs jsonb not null default '[]'::jsonb check (jsonb_typeof(faqs) = 'array'),
  source_kind text not null check (source_kind in ('synthetic', 'external', 'first_party')),
  publication_status text not null default 'draft' check (publication_status in ('draft', 'published', 'archived')),
  source_record_id uuid references public.source_records(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.treatment_conditions (
  treatment_id uuid not null references public.treatments(id) on delete cascade,
  condition_id uuid not null references public.conditions(id) on delete cascade,
  primary key (treatment_id, condition_id)
);
create table public.treatment_countries (
  treatment_id uuid not null references public.treatments(id) on delete cascade,
  country_id uuid not null references public.countries(id) on delete cascade,
  source_record_id uuid references public.source_records(id),
  primary key (treatment_id, country_id)
);
create table public.hospitals (
  id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null,
  city_id uuid not null references public.cities(id), description text not null, aliases text[] not null default '{}',
  bed_count integer check (bed_count >= 0), accreditation_note text,
  infrastructure text[] not null default '{}',
  verification_status public.provider_verification_status not null default 'draft',
  verification_source text, verification_date date, last_verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  source_kind text not null check (source_kind in ('synthetic', 'external', 'first_party')),
  publication_status text not null default 'draft' check (publication_status in ('draft', 'published', 'archived')),
  source_record_id uuid references public.source_records(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (source_kind <> 'synthetic' or verification_status <> 'verified'),
  check (verification_status <> 'verified' or (verified_by is not null and last_verified_at is not null))
);
create table public.hospital_specialties (
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  specialty_id uuid not null references public.specialties(id),
  primary key (hospital_id, specialty_id)
);
create table public.hospital_treatments (
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  treatment_id uuid not null references public.treatments(id),
  source_record_id uuid references public.source_records(id),
  primary key (hospital_id, treatment_id)
);
create table public.doctors (
  id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null,
  description text not null, aliases text[] not null default '{}', home_city_id uuid references public.cities(id),
  experience_years integer check (experience_years >= 0), languages text[] not null default '{}',
  consultation_mode text not null check (consultation_mode in ('video', 'in-person', 'both')),
  qualifications_note text not null default '',
  verification_status public.provider_verification_status not null default 'draft',
  verification_source text, verification_date date, last_verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  source_kind text not null check (source_kind in ('synthetic', 'external', 'first_party')),
  publication_status text not null default 'draft' check (publication_status in ('draft', 'published', 'archived')),
  source_record_id uuid references public.source_records(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (source_kind <> 'synthetic' or verification_status <> 'verified'),
  check (verification_status <> 'verified' or (verified_by is not null and last_verified_at is not null))
);
create table public.doctor_specialties (
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  specialty_id uuid not null references public.specialties(id),
  is_primary boolean not null default false, primary key (doctor_id, specialty_id)
);
create unique index doctor_one_primary_specialty on public.doctor_specialties(doctor_id) where is_primary;
create table public.doctor_treatments (
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  treatment_id uuid not null references public.treatments(id), primary key (doctor_id, treatment_id)
);
create table public.hospital_doctors (
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  is_primary boolean not null default false, starts_on date, ends_on date,
  source_record_id uuid references public.source_records(id),
  primary key (hospital_id, doctor_id), check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create unique index doctor_one_primary_hospital on public.hospital_doctors(doctor_id) where is_primary;
create table public.packages (
  id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null,
  description text not null, aliases text[] not null default '{}', treatment_id uuid not null references public.treatments(id),
  hospital_id uuid references public.hospitals(id), country_id uuid not null references public.countries(id),
  duration_days integer not null check (duration_days > 0), currency char(3) not null,
  estimated_min numeric(12,2) not null check (estimated_min >= 0),
  estimated_max numeric(12,2) not null check (estimated_max >= estimated_min),
  price_type text not null check (price_type in ('estimate', 'package_price', 'quoted', 'historical')),
  benefits text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'expired', 'archived')),
  valid_from date, valid_until date,
  source_kind text not null check (source_kind in ('synthetic', 'external', 'first_party')),
  source_record_id uuid references public.source_records(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (valid_until is null or valid_from is null or valid_until >= valid_from),
  check (source_kind <> 'synthetic' or price_type = 'estimate')
);
create table public.package_inclusions (
  package_id uuid not null references public.packages(id) on delete cascade, position integer not null check (position >= 0),
  description text not null, primary key (package_id, position)
);
create table public.package_exclusions (
  package_id uuid not null references public.packages(id) on delete cascade, position integer not null check (position >= 0),
  description text not null, primary key (package_id, position)
);
create table public.healthcare_services (
  id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null,
  description text not null, aliases text[] not null default '{}', href text not null,
  category text not null check (category in ('plan', 'treat', 'recover')),
  steps text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  source_kind text not null check (source_kind in ('synthetic', 'external', 'first_party')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.price_estimates (
  id uuid primary key default gen_random_uuid(), treatment_id uuid not null references public.treatments(id),
  country_id uuid not null references public.countries(id), hospital_id uuid references public.hospitals(id),
  package_id uuid references public.packages(id), currency char(3) not null,
  estimated_min numeric(12,2) not null check (estimated_min >= 0),
  estimated_max numeric(12,2) not null check (estimated_max >= estimated_min),
  pricing_type text not null check (pricing_type in ('estimate', 'package_price', 'quoted', 'historical')),
  effective_from date, expires_on date,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  publication_status text not null default 'draft' check (publication_status in ('draft', 'published', 'archived')),
  source_kind text not null check (source_kind in ('synthetic', 'external', 'first_party')),
  source_record_id uuid references public.source_records(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (expires_on is null or effective_from is null or expires_on >= effective_from),
  check (source_kind <> 'synthetic' or verification_status <> 'verified')
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text, locale text, timezone text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.cases (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id),
  status public.case_lifecycle_status not null default 'draft', title text not null,
  description text, preferred_country_id uuid references public.countries(id),
  preferred_city_id uuid references public.cities(id), preferred_treatment_id uuid references public.treatments(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.case_members (
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('caregiver', 'authorized_family', 'care_coordinator', 'clinician')),
  granted_by uuid not null references public.profiles(id), granted_at timestamptz not null default now(),
  revoked_at timestamptz, primary key (case_id, user_id)
);
create table public.case_status_history (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.cases(id) on delete cascade,
  from_status public.case_lifecycle_status, to_status public.case_lifecycle_status not null,
  changed_by uuid references public.profiles(id), changed_at timestamptz not null default now(), note text
);
create table public.consents (
  id uuid primary key default gen_random_uuid(), subject_id uuid not null references public.profiles(id),
  case_id uuid references public.cases(id), consent_type text not null,
  purpose text not null, decision text not null check (decision in ('granted', 'revoked')),
  granted_at timestamptz, revoked_at timestamptz, version text not null,
  source text not null, metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  check ((decision = 'granted' and granted_at is not null and revoked_at is null) or
         (decision = 'revoked' and revoked_at is not null))
);
create table public.case_documents (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.cases(id),
  uploaded_by uuid not null references public.profiles(id), document_type text not null,
  title text not null, storage_path text not null unique, mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes >= 0),
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'processed', 'failed', 'archived')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(), case_id uuid references public.cases(id),
  agent_name text not null, agent_version text not null, initiated_by uuid references public.profiles(id),
  purpose text not null, status text not null check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  started_at timestamptz, finished_at timestamptz, trace_id text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.agent_tasks (
  id uuid primary key default gen_random_uuid(), run_id uuid not null references public.agent_runs(id),
  case_id uuid references public.cases(id), task_type text not null, status text not null check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  objective text not null, due_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.agent_actions (
  id uuid primary key default gen_random_uuid(), run_id uuid not null references public.agent_runs(id),
  task_id uuid references public.agent_tasks(id), action_name text not null, tool_name text,
  tool_version text, status text not null check (status in ('proposed', 'approved', 'rejected', 'completed', 'failed')),
  input_hash text, output_hash text, requires_approval boolean not null default false,
  performed_at timestamptz, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table public.agent_outputs (
  id uuid primary key default gen_random_uuid(), run_id uuid not null references public.agent_runs(id),
  task_id uuid references public.agent_tasks(id), output_type text not null,
  content jsonb not null, source_record_ids uuid[] not null default '{}',
  review_status text not null default 'draft' check (review_status in ('draft', 'pending_review', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);
create table public.agent_approvals (
  id uuid primary key default gen_random_uuid(), action_id uuid not null unique references public.agent_actions(id),
  requested_by uuid references public.profiles(id), reviewer_id uuid references public.profiles(id),
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'rejected')),
  reason text, decided_at timestamptz, created_at timestamptz not null default now(),
  check ((decision = 'pending' and decided_at is null) or (decision <> 'pending' and decided_at is not null))
);
create table public.workflows (
  id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null,
  version integer not null default 1 check (version > 0), status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  definition jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(), workflow_id uuid not null references public.workflows(id),
  case_id uuid references public.cases(id), status text not null check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  idempotency_key text unique, started_at timestamptz, finished_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.workflow_steps (
  id uuid primary key default gen_random_uuid(), workflow_run_id uuid not null references public.workflow_runs(id),
  step_key text not null, position integer not null check (position >= 0),
  status text not null check (status in ('pending', 'running', 'completed', 'failed', 'skipped')),
  owner_id uuid references public.profiles(id), due_at timestamptz,
  started_at timestamptz, finished_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workflow_run_id, step_key)
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id),
  actor_type text not null check (actor_type in ('patient', 'caregiver', 'staff', 'agent', 'system')),
  event_name text not null, entity_type text not null, entity_id uuid,
  case_id uuid references public.cases(id), occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create function private.can_access_case(p_case_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.cases c where c.id = p_case_id and c.owner_id = (select auth.uid()))
  or exists (select 1 from public.case_members m where m.case_id = p_case_id and m.user_id = (select auth.uid()) and m.revoked_at is null);
$$;
create function private.is_case_owner(p_case_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.cases c where c.id = p_case_id and c.owner_id = (select auth.uid()));
$$;
revoke all on function private.can_access_case(uuid), private.is_case_owner(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.can_access_case(uuid), private.is_case_owner(uuid) to authenticated;

create function private.record_case_status() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.case_status_history(case_id, from_status, to_status, changed_by)
    values (new.id, case when tg_op = 'INSERT' then null else old.status end, new.status, auth.uid());
  end if;
  return new;
end; $$;
create trigger case_status_event after insert or update of status on public.cases
for each row execute function private.record_case_status();

create function private.create_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name) values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;
  return new;
end; $$;
create trigger profile_after_signup after insert on auth.users for each row execute function private.create_profile();

do $$ declare table_name text; begin
  foreach table_name in array array['countries','cities','specialties','conditions','treatments','hospitals','doctors','packages','healthcare_services','price_estimates','profiles','cases','case_documents','agent_runs','agent_tasks','workflows','workflow_runs','workflow_steps'] loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()', table_name);
  end loop;
end $$;

create index cities_country_idx on public.cities(country_id);
create index treatments_specialty_idx on public.treatments(specialty_id);
create index treatments_search_idx on public.treatments using gin (to_tsvector('simple', name || ' ' || description));
create index treatments_aliases_idx on public.treatments using gin (aliases);
create index treatment_countries_country_idx on public.treatment_countries(country_id);
create index hospital_city_idx on public.hospitals(city_id);
create index hospitals_status_idx on public.hospitals(publication_status, verification_status);
create index hospitals_search_idx on public.hospitals using gin (to_tsvector('simple', name || ' ' || description));
create index hospitals_aliases_idx on public.hospitals using gin (aliases);
create index hospital_specialties_specialty_idx on public.hospital_specialties(specialty_id);
create index hospital_treatments_treatment_idx on public.hospital_treatments(treatment_id);
create index doctor_city_idx on public.doctors(home_city_id);
create index doctors_status_idx on public.doctors(publication_status, verification_status);
create index doctors_search_idx on public.doctors using gin (to_tsvector('simple', name || ' ' || description));
create index doctor_specialties_specialty_idx on public.doctor_specialties(specialty_id);
create index doctor_treatments_treatment_idx on public.doctor_treatments(treatment_id);
create index hospital_doctors_doctor_idx on public.hospital_doctors(doctor_id);
create index packages_treatment_country_idx on public.packages(treatment_id, country_id);
create index packages_hospital_idx on public.packages(hospital_id);
create index packages_status_idx on public.packages(status, valid_until);
create index services_search_idx on public.healthcare_services using gin (to_tsvector('simple', name || ' ' || description));
create index price_estimates_lookup_idx on public.price_estimates(treatment_id, country_id, pricing_type, publication_status);
create index price_estimates_expiry_idx on public.price_estimates(expires_on);
create index source_records_source_idx on public.source_records(source_kind, verification_status, retrieved_at);
create index cases_owner_status_idx on public.cases(owner_id, status, updated_at desc);
create index case_members_user_idx on public.case_members(user_id, revoked_at);
create index case_history_case_idx on public.case_status_history(case_id, changed_at desc);
create index consents_subject_case_idx on public.consents(subject_id, case_id, created_at desc);
create index case_documents_case_idx on public.case_documents(case_id, status, created_at desc);
create index agent_runs_case_idx on public.agent_runs(case_id, created_at desc);
create index agent_tasks_case_status_idx on public.agent_tasks(case_id, status);
create index agent_actions_run_idx on public.agent_actions(run_id, created_at desc);
create index agent_outputs_run_idx on public.agent_outputs(run_id, created_at desc);
create index workflow_runs_case_idx on public.workflow_runs(case_id, status);
create index workflow_steps_run_idx on public.workflow_steps(workflow_run_id, position);
create index audit_events_entity_idx on public.audit_events(entity_type, entity_id, occurred_at desc);
create index audit_events_case_idx on public.audit_events(case_id, occurred_at desc);

do $$ declare table_name text; begin
  for table_name in select tablename from pg_tables where schemaname = 'public' and tablename in (
    'source_records','countries','cities','specialties','conditions','treatments','treatment_conditions','treatment_countries',
    'hospitals','hospital_specialties','hospital_treatments','doctors','doctor_specialties','doctor_treatments','hospital_doctors',
    'packages','package_inclusions','package_exclusions','healthcare_services','price_estimates','profiles','cases','case_members',
    'case_status_history','consents','case_documents','agent_runs','agent_tasks','agent_actions','agent_outputs','agent_approvals',
    'workflows','workflow_runs','workflow_steps','audit_events') loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

grant select on public.countries, public.cities, public.specialties, public.conditions, public.treatments,
  public.treatment_conditions, public.treatment_countries, public.hospitals, public.hospital_specialties,
  public.hospital_treatments, public.doctors, public.doctor_specialties, public.doctor_treatments,
  public.hospital_doctors, public.packages, public.package_inclusions, public.package_exclusions,
  public.healthcare_services, public.price_estimates to anon, authenticated;
grant select, insert, update on public.profiles, public.cases, public.case_members to authenticated;
grant select on public.case_status_history, public.case_documents to authenticated;
grant select, insert on public.consents to authenticated;

create policy countries_public on public.countries for select to anon, authenticated using (publication_status = 'published');
create policy cities_public on public.cities for select to anon, authenticated using (
  exists (select 1 from public.countries c where c.id = country_id and c.publication_status = 'published'));
create policy specialties_public on public.specialties for select to anon, authenticated using (true);
create policy conditions_public on public.conditions for select to anon, authenticated using (true);
create policy treatments_public on public.treatments for select to anon, authenticated using (publication_status = 'published');
create policy treatment_conditions_public on public.treatment_conditions for select to anon, authenticated using (
  exists (select 1 from public.treatments t where t.id = treatment_id and t.publication_status = 'published'));
create policy treatment_countries_public on public.treatment_countries for select to anon, authenticated using (
  exists (select 1 from public.treatments t where t.id = treatment_id and t.publication_status = 'published'));
create policy hospitals_public on public.hospitals for select to anon, authenticated using (
  publication_status = 'published' and (source_kind = 'synthetic' or verification_status = 'verified'));
create policy hospital_specialties_public on public.hospital_specialties for select to anon, authenticated using (
  exists (select 1 from public.hospitals h where h.id = hospital_id and h.publication_status = 'published' and (h.source_kind = 'synthetic' or h.verification_status = 'verified')));
create policy hospital_treatments_public on public.hospital_treatments for select to anon, authenticated using (
  exists (select 1 from public.hospitals h where h.id = hospital_id and h.publication_status = 'published' and (h.source_kind = 'synthetic' or h.verification_status = 'verified')));
create policy doctors_public on public.doctors for select to anon, authenticated using (
  publication_status = 'published' and (source_kind = 'synthetic' or verification_status = 'verified'));
create policy doctor_specialties_public on public.doctor_specialties for select to anon, authenticated using (
  exists (select 1 from public.doctors d where d.id = doctor_id and d.publication_status = 'published' and (d.source_kind = 'synthetic' or d.verification_status = 'verified')));
create policy doctor_treatments_public on public.doctor_treatments for select to anon, authenticated using (
  exists (select 1 from public.doctors d where d.id = doctor_id and d.publication_status = 'published' and (d.source_kind = 'synthetic' or d.verification_status = 'verified')));
create policy hospital_doctors_public on public.hospital_doctors for select to anon, authenticated using (
  exists (select 1 from public.doctors d where d.id = doctor_id and d.publication_status = 'published' and (d.source_kind = 'synthetic' or d.verification_status = 'verified')) and
  exists (select 1 from public.hospitals h where h.id = hospital_id and h.publication_status = 'published' and (h.source_kind = 'synthetic' or h.verification_status = 'verified')));
create policy packages_public on public.packages for select to anon, authenticated using (
  status = 'active' and (source_kind = 'synthetic' or valid_until is null or valid_until >= current_date));
create policy package_inclusions_public on public.package_inclusions for select to anon, authenticated using (
  exists (select 1 from public.packages p where p.id = package_id and p.status = 'active'));
create policy package_exclusions_public on public.package_exclusions for select to anon, authenticated using (
  exists (select 1 from public.packages p where p.id = package_id and p.status = 'active'));
create policy services_public on public.healthcare_services for select to anon, authenticated using (status = 'published');
create policy price_estimates_public on public.price_estimates for select to anon, authenticated using (
  publication_status = 'published' and (source_kind = 'synthetic' or (verification_status = 'verified' and (expires_on is null or expires_on >= current_date))));

create policy profiles_self_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_self_insert on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_self_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy cases_member_select on public.cases for select to authenticated using (private.can_access_case(id));
create policy cases_owner_insert on public.cases for insert to authenticated with check (owner_id = (select auth.uid()));
create policy cases_owner_update on public.cases for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy members_case_select on public.case_members for select to authenticated using (private.can_access_case(case_id));
create policy members_owner_insert on public.case_members for insert to authenticated with check (
  private.is_case_owner(case_id) and granted_by = (select auth.uid()) and user_id <> (select auth.uid()) and role in ('caregiver', 'authorized_family'));
create policy members_owner_update on public.case_members for update to authenticated using (private.is_case_owner(case_id)) with check (
  private.is_case_owner(case_id) and granted_by = (select auth.uid()) and role in ('caregiver', 'authorized_family'));
create policy case_history_member_select on public.case_status_history for select to authenticated using (private.can_access_case(case_id));
create policy consents_subject_select on public.consents for select to authenticated using (
  subject_id = (select auth.uid()) or (case_id is not null and private.can_access_case(case_id)));
create policy consents_subject_insert on public.consents for insert to authenticated with check (
  subject_id = (select auth.uid()) and (case_id is null or private.is_case_owner(case_id)));
create policy case_documents_member_select on public.case_documents for select to authenticated using (private.can_access_case(case_id));

create function private.block_audit_mutation() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Audit history is append-only'; end; $$;
create trigger audit_immutable before update or delete on public.audit_events
for each row execute function private.block_audit_mutation();
