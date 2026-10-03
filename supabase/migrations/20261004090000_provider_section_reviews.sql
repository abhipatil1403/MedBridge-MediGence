-- Review decisions belong to a frozen submission item, never the mutable draft.
alter table public.provider_submissions add column requires_section_review boolean not null default true;
update public.provider_submissions set requires_section_review=false where status in ('approved','published','archived','rejected','changes_requested');

create table public.provider_section_reviews (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  submission_id uuid not null,
  record_id uuid not null,
  revision integer not null,
  organization_id uuid not null references public.organizations(id),
  status text not null check(status in ('under_review','approved','changes_requested','evidence_required','rejected')),
  comment text not null default '' check(length(comment)<=10000),
  reason text not null default '' check(length(reason)<=500),
  document_id uuid references public.provider_documents(id),
  reviewed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(submission_id,record_id) references public.provider_submission_items(submission_id,record_id),
  foreign key(record_id,revision) references public.provider_revisions(record_id,revision),
  check(status not in ('changes_requested','evidence_required','rejected') or length(trim(comment))>=5)
);
create index section_review_latest on public.provider_section_reviews(submission_id,record_id,sequence desc);
create index section_review_tenant on public.provider_section_reviews(organization_id,created_at desc);
alter table public.provider_section_reviews enable row level security;
grant select on public.provider_section_reviews to authenticated;
grant all on public.provider_section_reviews to service_role;
grant usage,select on sequence public.provider_section_reviews_sequence_seq to service_role;
create policy section_review_read on public.provider_section_reviews for select to authenticated using (
  private.portal_member(organization_id) or (private.portal_active() and private.portal_reviewer(submission_id))
);
create trigger section_reviews_immutable before update or delete on public.provider_section_reviews for each row execute function private.block_audit_mutation();

create function private.portal_section_evidence_current(p_record uuid,p_revision integer,p_org uuid,p_document uuid default null) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.provider_revisions v where v.record_id=p_record and v.revision=p_revision and v.organization_id=p_org
    and coalesce(jsonb_typeof(v.data->'documentIds'),'null') in ('array','null')
    and not exists(select 1 from (
      select jsonb_array_elements_text(case when jsonb_typeof(v.data->'documentIds')='array' then v.data->'documentIds' else '[]'::jsonb end) id
      union select nullif(v.data->>'documentId','')
      union select nullif(v.data->>'imageDocumentId','')
      union select p_document::text
    ) ref where ref.id is not null and not exists(select 1 from public.provider_documents d where d.id=ref.id::uuid and d.organization_id=p_org and (d.record_id is null or d.record_id=p_record) and d.status='approved' and (d.expires_on is null or d.expires_on>=current_date))));
$$;
revoke all on function private.portal_section_evidence_current(uuid,integer,uuid,uuid) from public;
create function private.portal_sections_approved(p_submission uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.provider_submission_items where submission_id=p_submission)
    and not exists(select 1 from public.provider_submission_items i where i.submission_id=p_submission and
      not coalesce((select r.status='approved' and private.portal_section_evidence_current(r.record_id,r.revision,r.organization_id,r.document_id) from public.provider_section_reviews r where r.submission_id=i.submission_id and r.record_id=i.record_id and r.revision=i.revision order by sequence desc limit 1),false));
$$;
revoke all on function private.portal_sections_approved(uuid) from public;

create function private.portal_submission_review_gate() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('approved','published') and new.status is distinct from old.status then
    if not private.portal_admin() then raise exception 'PORTAL_DENIED';end if;
    if new.requires_section_review and not private.portal_sections_approved(new.id) then raise exception 'PORTAL_SECTIONS_UNRESOLVED';end if;
  end if;
  return new;
end;$$;
revoke all on function private.portal_submission_review_gate() from public;
create trigger submission_section_gate before update on public.provider_submissions for each row execute function private.portal_submission_review_gate();

create function public.portal_review_command(p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.provider_submissions; i public.provider_submission_items; r public.provider_records; result jsonb; st text; doc uuid;
begin
  if not private.portal_active() then raise exception 'PORTAL_DENIED';end if;
  select * into s from public.provider_submissions where id=(p_input->>'submissionId')::uuid for update;
  if not found then raise exception 'PORTAL_NOT_FOUND';end if;
  if not private.portal_reviewer(s.id) then raise exception 'PORTAL_DENIED';end if;
  if p_action='open_submission' then
    perform private.portal_audit('submission.opened','submission',s.id,s.organization_id,null,jsonb_build_object('status',s.status));
    return jsonb_build_object('id',s.id);
  elsif p_action='review_section' then
    if s.status not in ('submitted','under_review') then raise exception 'PORTAL_TRANSITION_INVALID';end if;
    st:=p_input->>'status';
    if st is null or st not in ('under_review','approved','changes_requested','evidence_required','rejected') then raise exception 'PORTAL_INVALID';end if;
    if st='approved' and not private.portal_admin() then raise exception 'PORTAL_DENIED';end if;
    if st in ('changes_requested','evidence_required','rejected') and length(trim(coalesce(p_input->>'comment','')))<5 then raise exception 'PORTAL_REVIEW_REASON_REQUIRED';end if;
    select * into i from public.provider_submission_items where submission_id=s.id and record_id=(p_input->>'recordId')::uuid;
    if not found then raise exception 'PORTAL_NOT_FOUND';end if;
    select * into r from public.provider_records where id=i.record_id for update;
    if r.revision<>i.revision or i.revision is distinct from (p_input->>'expectedRevision')::integer then raise exception 'PORTAL_CONFLICT';end if;
    doc:=nullif(p_input->>'documentId','')::uuid;
    if st='approved' and not private.portal_section_evidence_current(r.id,i.revision,s.organization_id,doc) then raise exception 'PORTAL_EVIDENCE_REQUIRED';end if;
    if doc is not null and not exists(select 1 from public.provider_documents where id=doc and organization_id=s.organization_id and (record_id is null or record_id=i.record_id) and status not in ('archived','expired') and (st<>'approved' or status='approved') and (expires_on is null or expires_on>=current_date)) then raise exception 'PORTAL_EVIDENCE_REQUIRED';end if;
    if s.status='submitted' then perform public.portal_command('review_submission',jsonb_build_object('submissionId',s.id,'status','under_review'));end if;
    insert into public.provider_section_reviews(submission_id,record_id,revision,organization_id,status,comment,reason,document_id,reviewed_by)
      values(s.id,i.record_id,i.revision,s.organization_id,st,coalesce(p_input->>'comment',''),coalesce(p_input->>'reason',''),doc,auth.uid()) returning to_jsonb(provider_section_reviews.*) into result;
    perform private.portal_audit('section.'||st,r.kind,r.id,s.organization_id,null,result);
    perform private.portal_notify_org(s.organization_id,'Review: '||r.name,replace(st,'_',' ')||case when coalesce(p_input->>'comment','')<>'' then ': '||(p_input->>'comment') else '' end,'submission',s.id);
    return result;
  end if;
  raise exception 'PORTAL_ACTION_INVALID';
end;$$;
revoke all on function public.portal_review_command(text,jsonb) from public,anon;
grant execute on function public.portal_review_command(text,jsonb) to authenticated;

create function private.portal_public_visible(p_kind text,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select private.portal_published(p_kind,p_id) and case p_kind
    when 'hospital' then exists(select 1 from public.hospitals where id=p_id and publication_status='published')
    when 'doctor' then exists(select 1 from public.doctors where id=p_id and publication_status='published')
    when 'package' then exists(select 1 from public.packages p join public.treatments t on t.id=p.treatment_id join public.countries c on c.id=p.country_id where p.id=p_id and p.publication_status='published' and p.status='active' and t.publication_status='published' and c.publication_status='published' and (p.valid_from is null or p.valid_from<=current_date) and (p.valid_until is null or p.valid_until>=current_date) and (p.hospital_id is null or exists(select 1 from public.hospitals h where h.id=p.hospital_id and h.publication_status='published')))
    else false end;
$$;
revoke all on function private.portal_public_visible(text,uuid) from public;
-- Public projections have an explicit allowlist. Reviewer comments and evidence
-- text remain private; only status, checked dates and public sources leave it.
alter function public.public_provider_profile(uuid) set schema private;
revoke all on function private.public_provider_profile(uuid) from public,anon,authenticated;
create function public.public_provider_profile(p_hospital_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; org uuid;
begin
  if not private.portal_public_visible('hospital',p_hospital_id) then return '{}'::jsonb;end if;
  result:=coalesce(private.public_provider_profile(p_hospital_id),'{}'::jsonb);
  select id into org from public.organizations where hospital_id=p_hospital_id;
  result:=result||jsonb_build_object('fieldReviews',coalesce((select jsonb_agg(x-'evidence') from jsonb_array_elements(coalesce(result->'fieldReviews','[]'::jsonb)) x),'[]'::jsonb));
  return result||jsonb_build_object('sections',coalesce((select jsonb_agg(jsonb_build_object('kind',r.kind,'name',v.name,'description',v.data->'description','department',v.data->'department','availability',v.data->'availability','category',v.data->'category','eligibilityNote',v.data->'eligibilityNote','quantity',v.data->'quantity','facilityType',v.data->'facilityType'))
    from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision
    where r.organization_id=org and r.kind in ('specialty','treatment','facility')),'[]'::jsonb));
end;$$;
revoke all on function public.public_provider_profile(uuid) from public;
grant execute on function public.public_provider_profile(uuid) to anon,authenticated;

create function private.portal_package_details(p_data jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb:='{}'::jsonb; k text;
begin
  foreach k in array array['accommodation','transfer','interpreter','consultation','diagnostics','followUp'] loop
    result:=result||jsonb_build_object(k,jsonb_build_object('status',case when p_data->>(k||'Status') in ('included','excluded','conditional','not_confirmed') then p_data->>(k||'Status') else 'not_confirmed' end,'information',nullif(p_data->>(k||'Info'),'')));
  end loop;
  return result;
end;$$;
revoke all on function private.portal_package_details(jsonb) from public;
create or replace function public.public_provider_record(p_kind text,p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('professionalTitle',v.data->'professionalTitle','department',v.data->'department','terms',v.data->'terms','validFrom',v.data->'validFrom','validUntil',v.data->'validUntil','notes',v.data->'notes','serviceDetails',case when p_kind='package' then private.portal_package_details(v.data) else '{}'::jsonb end,'hasImage',
    exists(select 1 from public.provider_documents d where d.id=nullif(v.data->>'imageDocumentId','')::uuid and d.organization_id=r.organization_id and d.status='approved' and d.document_type='profile_image' and d.mime_type in ('image/jpeg','image/png') and (d.expires_on is null or d.expires_on>=current_date)))
  from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision
  where r.kind=p_kind and p_kind in ('doctor','package') and r.canonical_id=p_id and private.portal_public_visible(p_kind,p_id) limit 1;
$$;
create function public.public_provider_package_details() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',r.canonical_id,'serviceDetails',private.portal_package_details(v.data))),'[]'::jsonb)
    from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision
    where r.kind='package' and private.portal_public_visible('package',r.canonical_id);
$$;
revoke all on function public.public_provider_package_details() from public;
grant execute on function public.public_provider_package_details() to anon,authenticated;

create function public.portal_listing_status(p_organization_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare profile public.provider_records; s public.provider_submissions; required text[]; missing text[]; reviewed timestamptz;
begin
  if not (private.portal_member(p_organization_id) or private.portal_admin()) then raise exception 'PORTAL_DENIED';end if;
  select * into profile from public.provider_records where organization_id=p_organization_id and kind='organization';
  select array_agg(x) into required from public.portal_settings,jsonb_array_elements_text(value) x where key='provider_required_fields';
  select array_agg(k) into missing from unnest(required) k where case when k='name' then length(trim(coalesce(profile.name,'')))=0 else length(trim(coalesce(profile.data->>k,'')))=0 end;
  select * into s from public.provider_submissions where organization_id=p_organization_id order by submitted_at desc limit 1;
  select max(created_at) into reviewed from public.provider_section_reviews where organization_id=p_organization_id;
  return jsonb_build_object('required',required,'missing',coalesce(missing,array[]::text[]),'completed',cardinality(required)-coalesce(cardinality(missing),0),'total',cardinality(required),'profileStatus',coalesce(profile.status,'draft'),'publishedRevision',profile.published_revision,'submissionStatus',s.status,'lastSubmitted',s.submitted_at,'lastReviewed',reviewed,'reviewComment',s.review_message,
    'pendingDocuments',(select count(*) from public.provider_documents where organization_id=p_organization_id and status in ('uploaded','under_review')),
    'documentsNeedingReplacement',(select count(*) from public.provider_documents where organization_id=p_organization_id and status in ('rejected','expired')),
    'packagesAwaitingReview',(select count(*) from public.provider_records where organization_id=p_organization_id and kind='package' and status in ('submitted','under_review')),
    'requestedChanges',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'recordId',x.record_id,'name',r.name,'kind',r.kind,'status',x.status,'comment',x.comment,'reason',x.reason,'revision',x.revision,'currentRevision',r.revision,'submissionId',x.submission_id,'createdAt',x.created_at)) from (select distinct on(record_id) * from public.provider_section_reviews where organization_id=p_organization_id order by record_id,sequence desc)x join public.provider_records r on r.id=x.record_id where x.status in ('changes_requested','evidence_required','rejected') and r.status in ('changes_requested','draft','submitted','under_review')),'[]'::jsonb));
end;$$;
revoke all on function public.portal_listing_status(uuid) from public,anon;
grant execute on function public.portal_listing_status(uuid) to authenticated;

create function public.portal_submission_summary(p_submission_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.provider_submissions;
begin
  select * into s from public.provider_submissions where id=p_submission_id;
  if not found or not(private.portal_member(s.organization_id) or (private.portal_active() and private.portal_reviewer(s.id))) then raise exception 'PORTAL_DENIED';end if;
  return jsonb_build_object('organizationName',(select name from public.organizations where id=s.organization_id),'providerName',coalesce((select display_name from public.profiles where id=s.submitted_by),'Provider member'),'reviewerName',case when s.reviewer_id is null then 'Unassigned' else coalesce((select display_name from public.profiles where id=s.reviewer_id),'Assigned reviewer') end,'sectionCount',(select count(*) from public.provider_submission_items where submission_id=s.id),'approvedSections',(select count(*) from public.provider_submission_items i where i.submission_id=s.id and (select status from public.provider_section_reviews where submission_id=s.id and record_id=i.record_id order by sequence desc limit 1)='approved'),'verificationIssues',(select count(*) from (select distinct on(f.record_id,f.field) f.status,f.expires_on from public.provider_field_reviews f join public.provider_submission_items i on i.record_id=f.record_id and i.revision=f.revision where i.submission_id=s.id order by f.record_id,f.field,f.sequence desc)x where status in ('needs_confirmation','conflicting','rejected','stale') or expires_on<current_date));
end;$$;
revoke all on function public.portal_submission_summary(uuid) from public,anon;
grant execute on function public.portal_submission_summary(uuid) to authenticated;

create function public.public_provider_hospital_details() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'accreditations',public.public_provider_profile(h.id)->'accreditations','locations',public.public_provider_profile(h.id)->'locations')),'[]'::jsonb)
    from public.hospitals h where private.portal_public_visible('hospital',h.id);
$$;
revoke all on function public.public_provider_hospital_details() from public;
grant execute on function public.public_provider_hospital_details() to anon,authenticated;

-- Explicitly unavailable services do not become searchable offerings.
create or replace function private.portal_refresh_hospital(p_org uuid) returns void language plpgsql security definer set search_path='' as $$
declare hid uuid;begin
  select hospital_id into hid from public.organizations where id=p_org;if hid is null then return;end if;
  delete from public.hospital_specialties where hospital_id=hid;
  insert into public.hospital_specialties(hospital_id,specialty_id)
    select distinct hid,(v.data->>'specialtyId')::uuid from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision where r.organization_id=p_org and r.kind='specialty';
  delete from public.hospital_treatments where hospital_id=hid;
  insert into public.hospital_treatments(hospital_id,treatment_id,source_record_id)
    select distinct on(v.data->>'treatmentId') hid,(v.data->>'treatmentId')::uuid,
      (select id from public.source_records where source_identifier='provider-record:'||r.id||':revision:'||v.revision limit 1)
    from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision where r.organization_id=p_org and r.kind='treatment' and coalesce(v.data->>'availability','')<>'unavailable';
  update public.hospitals set infrastructure=coalesce((select array_agg(v.name order by v.name) from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision where r.organization_id=p_org and r.kind in ('facility','international_service') and coalesce(v.data->>'availability','')<>'unavailable'),'{}'),
    bed_count=(select nullif(v.data->>'quantity','')::integer from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision where r.organization_id=p_org and r.kind='facility' and v.data->>'facilityType'='beds' and coalesce(v.data->>'availability','')<>'unavailable' limit 1),
    accreditation_note=(select string_agg(v.name,'; ' order by v.name) from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision join public.provider_documents d on d.id=(v.data->>'documentId')::uuid where r.organization_id=p_org and r.kind='accreditation' and d.status='approved' and (d.expires_on is null or d.expires_on>=current_date) and (nullif(v.data->>'expiresOn','') is null or (v.data->>'expiresOn')::date>=current_date)) where id=hid;
end;$$;
