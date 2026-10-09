-- Extend the existing Support case system; no parallel case management table.
alter table public.support_cases
  add column doctor_id uuid references public.doctors(id),
  add column package_id uuid references public.packages(id),
  add column inquiry_source text not null default 'legacy' check(inquiry_source in ('legacy','hospital_detail','doctor_detail','package_detail','ai_finding','saved_item','help','recover')),
  add column entity_snapshot jsonb not null default '{}',
  add column resolution_summary text check(length(resolution_summary)<=4000),
  add column provider_response_status text not null default 'not_requested' check(provider_response_status in ('not_requested','pending','information_requested','responded','accepted_for_coordination','unable_to_coordinate')),
  add column provider_responded_by uuid references auth.users(id),
  add column provider_responded_at timestamptz,
  add column recovery_journey_id uuid references public.recovery_journeys(id);
alter table public.support_cases drop constraint support_cases_status_check;
alter table public.support_cases add constraint support_cases_status_check check(status in ('open','in_progress','waiting_patient','waiting_provider','escalated','resolved','closed','cancelled'));
create index support_cases_patient_updated on public.support_cases(patient_id,updated_at desc);
create index support_cases_provider_queue on public.support_cases(organization_id,updated_at desc) where share_with_provider;

create table public.support_case_provider_consents (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.support_cases(id),
  owner_id uuid not null references public.profiles(id), organization_id uuid not null references public.organizations(id),
  purpose text not null check(length(trim(purpose)) between 5 and 400), granted_at timestamptz not null default now(), revoked_at timestamptz
);
create unique index support_provider_consent_active on public.support_case_provider_consents(case_id,organization_id) where revoked_at is null;
create table public.support_document_requests (
  id uuid primary key default gen_random_uuid(),case_id uuid not null references public.support_cases(id),
  requested_by uuid not null references auth.users(id), requesting_party text not null,
  title text not null check(length(trim(title)) between 3 and 180), purpose text not null check(length(trim(purpose)) between 5 and 800),
  visibility text not null check(visibility in ('patient','provider','shared')),
  status text not null default 'requested' check(status in ('requested','uploaded','replacement_requested','accepted_for_coordination','withdrawn')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.support_case_documents (
  id uuid primary key default gen_random_uuid(),case_id uuid not null references public.support_cases(id),owner_id uuid not null references public.profiles(id),
  request_id uuid references public.support_document_requests(id),replaces_id uuid references public.support_case_documents(id),
  filename text not null check(length(filename) between 1 and 180 and filename !~ '[\\/[:cntrl:]]'),
  mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg')),
  size_bytes integer not null check(size_bytes between 1 and 3145728),checksum text not null check(checksum ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending_upload' check(status in ('pending_upload','uploaded','under_review','accepted_for_coordination','replacement_requested','withdrawn')),
  uploaded_at timestamptz,reviewed_by uuid references auth.users(id),reviewed_at timestamptz,review_note text check(length(review_note)<=800),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index support_documents_case on public.support_case_documents(case_id,created_at);
create table public.support_document_grants (
  id uuid primary key default gen_random_uuid(), document_id uuid not null references public.support_case_documents(id),
  case_id uuid not null references public.support_cases(id),owner_id uuid not null references public.profiles(id),
  recipient text not null check(recipient in ('support','provider')), organization_id uuid references public.organizations(id),
  purpose text not null check(length(trim(purpose)) between 5 and 400),granted_at timestamptz not null default now(),revoked_at timestamptz,
  check((recipient='support' and organization_id is null) or (recipient='provider' and organization_id is not null))
);
create unique index support_document_grant_active on public.support_document_grants(document_id,recipient) where revoked_at is null;
create table public.support_operation_receipts (
  actor_id uuid not null references auth.users(id),operation_id uuid not null,action text not null,input_hash text not null,
  case_id uuid not null references public.support_cases(id),result jsonb not null,created_at timestamptz not null default now(),
  primary key(actor_id,operation_id)
);
create table public.support_message_reads (
  case_id uuid not null references public.support_cases(id),user_id uuid not null references auth.users(id),read_at timestamptz not null default now(),
  primary key(case_id,user_id)
);
alter table public.recovery_tasks add column support_case_id uuid references public.support_cases(id),add column support_event_id uuid references public.support_case_events(id);
create unique index recovery_inquiry_event_task on public.recovery_tasks(owner_id,journey_id,support_event_id) where support_event_id is not null;

create or replace function private.portal_case_access(p_case uuid) returns boolean language sql stable security definer set search_path='' as $$
  select private.portal_active() and exists(select 1 from public.support_cases c where c.id=p_case and
    (c.patient_id=auth.uid() or (c.consent_revoked_at is null and (private.portal_manager()
      or (private.portal_role()='support_agent' and (c.assigned_to=auth.uid() or c.assigned_to is null))
      or (c.share_with_provider and private.portal_member(c.organization_id) and (c.inquiry_source='legacy'
        or exists(select 1 from public.support_case_provider_consents g where g.case_id=c.id and g.organization_id=c.organization_id and g.owner_id=c.patient_id and g.revoked_at is null)))))));
$$;
create function private.inquiry_document_access(p_document uuid) returns boolean language sql stable security definer set search_path='' as $$
  select private.portal_active() and exists(select 1 from public.support_case_documents d join public.support_cases c on c.id=d.case_id
    where d.id=p_document and (d.owner_id=auth.uid() or (d.status not in ('withdrawn','pending_upload') and c.consent_revoked_at is null and private.portal_case_access(c.id)
      and exists(select 1 from public.support_document_grants g where g.document_id=d.id and g.case_id=c.id and g.owner_id=c.patient_id and g.revoked_at is null
        and ((g.recipient='support' and private.portal_case_staff(c.id)) or (g.recipient='provider' and g.organization_id=c.organization_id and c.share_with_provider and private.portal_member(g.organization_id)))))));
$$;
create function private.inquiry_owner(p_case uuid) returns boolean language sql stable security definer set search_path='' as $$
  select private.portal_active() and exists(select 1 from public.support_cases c where c.id=p_case and c.patient_id=auth.uid());
$$;
create function private.inquiry_transition(p_old text,p_new text,p_manager boolean) returns boolean language sql immutable set search_path='' as $$
  select p_old=p_new or case p_old
    when 'open' then p_new in ('in_progress','waiting_patient','waiting_provider','escalated','resolved','closed')
    when 'in_progress' then p_new in ('waiting_patient','waiting_provider','escalated','resolved','closed')
    when 'waiting_patient' then p_new in ('in_progress','waiting_provider','escalated','resolved','closed')
    when 'waiting_provider' then p_new in ('in_progress','waiting_patient','escalated','resolved','closed')
    when 'escalated' then p_new in ('in_progress','waiting_patient','waiting_provider','resolved','closed')
    when 'resolved' then p_new='closed' or (p_manager and p_new='open')
    when 'closed' then p_manager and p_new='open' else false end;
$$;
create function private.inquiry_emit(p_case uuid,p_action text,p_summary text,p_visibility text) returns uuid language plpgsql security definer set search_path='' as $$
declare eid uuid;begin
  insert into public.support_case_events(case_id,actor_id,action,summary,visibility) values(p_case,auth.uid(),p_action,p_summary,p_visibility) returning id into eid;
  perform private.portal_audit(p_action,'support_case',p_case,null,null,null);
  perform private.support_notify(p_case,p_summary,p_visibility);
  return eid;
end;$$;

do $$declare t text;begin foreach t in array array['support_case_provider_consents','support_document_requests','support_case_documents','support_document_grants','support_operation_receipts','support_message_reads'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
end loop;end;$$;
create policy inquiry_provider_consents_read on public.support_case_provider_consents for select to authenticated using(private.inquiry_owner(case_id) or (private.portal_case_access(case_id) and (private.portal_case_staff(case_id) or private.portal_member(organization_id))));
create policy inquiry_document_requests_read on public.support_document_requests for select to authenticated using(private.portal_case_visibility(case_id,visibility));
create policy inquiry_documents_read on public.support_case_documents for select to authenticated using(private.inquiry_document_access(id));
create policy inquiry_document_grants_read on public.support_document_grants for select to authenticated using(private.inquiry_owner(case_id) or (revoked_at is null and private.inquiry_document_access(document_id)));
create policy inquiry_receipts_read on public.support_operation_receipts for select to authenticated using(actor_id=auth.uid() and private.portal_case_access(case_id));
create policy inquiry_message_reads on public.support_message_reads for select to authenticated using(user_id=auth.uid() and private.portal_case_access(case_id));
create trigger inquiry_receipts_immutable before update or delete on public.support_operation_receipts for each row execute function private.block_audit_mutation();
revoke all on function private.inquiry_document_access(uuid),private.inquiry_owner(uuid),private.inquiry_transition(text,text,boolean),private.inquiry_emit(uuid,text,text,text) from public,anon,authenticated;
grant execute on function private.inquiry_document_access(uuid),private.inquiry_owner(uuid) to authenticated;
