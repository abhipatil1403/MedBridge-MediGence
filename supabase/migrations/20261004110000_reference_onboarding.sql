-- Reference onboarding extends the existing immutable submission/publication
-- pipeline. No separate public catalog, automatic publication or QA promotion.
alter table public.organizations drop constraint organizations_source_kind_check;
alter table public.organizations add constraint organizations_source_kind_check check(source_kind in ('first_party','external','synthetic'));
alter table public.organizations add column onboarding_origin text not null default 'provider_submitted';
update public.organizations set onboarding_origin='synthetic_qa' where source_kind='synthetic';
alter table public.organizations add constraint organization_origin_check check(
  (source_kind='first_party' and onboarding_origin='provider_submitted') or
  (source_kind='external' and onboarding_origin='admin_reference') or
  (source_kind='synthetic' and onboarding_origin='synthetic_qa'));
alter table public.source_records add column source_type text check(source_type in ('provider_website','provider_directory','government','regulator','recognized_organization','secondary'));
alter table public.source_records add column review_after date;
alter table public.doctors alter column consultation_mode drop not null;

create table public.provider_reference_claims (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null, revision integer not null,
  organization_id uuid not null references public.organizations(id),
  field text not null check(length(field) between 1 and 80),
  supported_value jsonb not null,
  source_record_id uuid not null references public.source_records(id),
  evidence_summary text not null check(length(trim(evidence_summary)) between 10 and 3000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(record_id,revision) references public.provider_revisions(record_id,revision),
  unique(record_id,revision,field)
);
create index reference_claims_org on public.provider_reference_claims(organization_id,record_id,revision);
alter table public.provider_reference_claims enable row level security;
create policy reference_claims_admin on public.provider_reference_claims for select to authenticated using(private.portal_admin());
grant select on public.provider_reference_claims to authenticated;
grant all on public.provider_reference_claims to service_role;
create trigger reference_claims_immutable before update or delete on public.provider_reference_claims for each row execute function private.block_audit_mutation();

create function private.portal_reference(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.organizations where id=p_org and onboarding_origin='admin_reference');
$$;
-- Even a accidentally assigned reviewer/member cannot gain reference access.
create or replace function private.portal_reviewer(p_submission uuid) returns boolean language sql stable security definer set search_path='' as $$
  select private.portal_admin() or exists(select 1 from public.provider_submissions s where s.id=p_submission and not private.portal_reference(s.organization_id) and s.reviewer_id=auth.uid() and private.portal_role() in ('support_agent','support_manager'));
$$;
create or replace function private.portal_org_reviewer(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
  select not private.portal_reference(p_org) and exists(select 1 from public.provider_submissions where organization_id=p_org and reviewer_id=auth.uid() and private.portal_role() in ('support_agent','support_manager'));
$$;
create or replace function private.portal_member(p_org uuid,p_admin boolean default false) returns boolean language sql stable security definer set search_path='' as $$
  select private.portal_active() and not private.portal_reference(p_org) and exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.organization_id=p_org and m.user_id=auth.uid() and m.active and o.status='active' and (not p_admin or m.role='provider_admin'));
$$;

create function private.reference_validate_record(p_kind text,p_data jsonb,p_submit boolean,p_org uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.portal_reference(p_org) then perform private.portal_validate_record(p_kind,p_data,p_submit);return;end if;
  perform private.portal_validate_record(p_kind,p_data,false);
  if not p_submit then return;end if;
  if p_kind='organization' then
    if length(coalesce(p_data->>'description',''))<10 or not private.catalog_public_visible('cities',nullif(p_data->>'cityId','')::uuid) then raise exception 'PORTAL_PROFILE_REQUIRED';end if;
    if nullif(p_data->>'email','') is not null and p_data->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'PORTAL_INVALID';end if;
  elsif p_kind='doctor' then
    if not private.catalog_public_visible('specialties',nullif(p_data->>'specialtyId','')::uuid) or length(coalesce(p_data->>'biography',''))<10 then raise exception 'PORTAL_DOCTOR_REQUIRED';end if;
    if nullif(p_data->>'consultationMode','') is not null and p_data->>'consultationMode' not in ('video','in-person','both') then raise exception 'PORTAL_INVALID';end if;
  else perform private.portal_validate_record(p_kind,p_data,true);end if;
  if p_kind not in ('organization','location') then
    if not exists(select 1 from public.provider_records l where l.organization_id=p_org and l.kind='location' and l.id=nullif(p_data->>'locationId','')::uuid and l.status not in ('archived','expired','rejected')) then raise exception 'PORTAL_REFERENCE_LOCATION_REQUIRED';end if;
    if p_kind='doctor' and jsonb_array_length(coalesce(p_data->'locationIds','[]'))>0 and p_data->'locationIds'<>jsonb_build_array(p_data->>'locationId') then raise exception 'PORTAL_REFERENCE_LOCATION_REQUIRED';end if;
  end if;
end;$$;

-- Update only the audited call sites; provider validation remains identical.
do $$declare d text;begin
  d:=pg_get_functiondef('public.portal_command(text,jsonb)'::regprocedure);
  d:=replace(d,'private.portal_validate_record(p_input->>''kind'',p_input->''data'')','private.reference_validate_record(p_input->>''kind'',p_input->''data'',false,org)');
  d:=replace(d,'private.portal_validate_record(r.kind,r.data,true)','private.reference_validate_record(r.kind,r.data,true,org)');
  -- Existing creation must choose origin server-side, never from client flags.
  d:=replace(d,'provider_type,source_kind,created_by)','provider_type,source_kind,created_by,onboarding_origin)');
  d:=replace(d,'coalesce(p_input->>''sourceKind'',''first_party''),uid)','coalesce(p_input->>''sourceKind'',''first_party''),uid,case when p_input->>''sourceKind''=''synthetic'' then ''synthetic_qa'' else ''provider_submitted'' end)');
  execute d;
  d:=pg_get_functiondef('private.portal_project_record_previous(uuid,integer)'::regprocedure);
  d:=replace(d,'private.portal_validate_record(r.kind,v.data,true)','private.reference_validate_record(r.kind,v.data,true,o.id)');execute d;
end;$$;

-- Claims always bind the immutable value, not an editable draft or free text.
create function private.reference_claims_complete(p_record uuid,p_revision integer,p_reviewed boolean) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.provider_revisions v where v.record_id=p_record and v.revision=p_revision) and not exists(
    select 1 from public.provider_revisions v cross join lateral jsonb_each(v.data||jsonb_build_object('name',v.name)) f
    where v.record_id=p_record and v.revision=p_revision and f.value not in ('null'::jsonb,'""'::jsonb,'[]'::jsonb)
    and not exists(select 1 from public.provider_reference_claims c join public.source_records s on s.id=c.source_record_id
      where c.record_id=p_record and c.revision=p_revision and c.organization_id=v.organization_id and c.field=f.key and c.supported_value=f.value
      and s.source_kind='external' and s.source_type is not null and private.catalog_public_url(s.source_url) is not null
      and s.retrieved_at is not null and s.retrieved_at<=now()+interval '5 minutes' and s.verification_status not in ('rejected','conflicting','stale')
      and (not p_reviewed or (s.review_after is null or s.review_after>=current_date))
      and (not p_reviewed or exists(select 1 from public.provider_field_reviews r where r.record_id=c.record_id and r.revision=c.revision and r.field=c.field
        and r.status in ('approved','verified') and r.source_url=s.source_url and (r.expires_on is null or r.expires_on>=current_date)
        and not exists(select 1 from public.provider_field_reviews later where later.record_id=r.record_id and later.revision=r.revision and later.field=r.field and later.sequence>r.sequence)
        and (r.document_id is null or exists(select 1 from public.provider_documents doc where doc.id=r.document_id and doc.status='approved' and (doc.expires_on is null or doc.expires_on>=current_date)))))));
$$;

alter function public.portal_command(text,jsonb) set schema private;
alter function private.portal_command(text,jsonb) rename to portal_command_before_reference;
create function public.portal_command(p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;rid uuid;sid uuid;item record;s public.source_records;claim public.provider_reference_claims;
begin
  org:=nullif(p_input->>'organizationId','')::uuid;rid:=nullif(p_input->>'recordId','')::uuid;sid:=nullif(p_input->>'submissionId','')::uuid;
  if rid is not null then select organization_id into org from public.provider_records where id=rid;end if;
  if sid is not null then select organization_id into org from public.provider_submissions where id=sid;end if;
  if p_action='create_organization' and coalesce(p_input->>'sourceKind','first_party') not in ('first_party','synthetic') then raise exception 'PORTAL_DENIED';end if;
  if private.portal_reference(org) then
    if not private.portal_active() or not private.portal_admin() then raise exception 'PORTAL_DENIED';end if;
    if p_action in ('invite_member','update_member','duplicate_record') then raise exception 'PORTAL_DENIED';end if;
    if p_action='assign_reviewer' and not exists(select 1 from public.staff_roles where user_id=(p_input->>'userId')::uuid and active and role in ('admin','super_admin')) then raise exception 'PORTAL_DENIED';end if;
    if p_action='submit' then
      for item in select id,revision from public.provider_records where organization_id=org and status in ('draft','changes_requested') and (rid is null or id=rid) loop
        if not private.reference_claims_complete(item.id,item.revision,false) then raise exception 'PORTAL_REFERENCE_CLAIMS_REQUIRED';end if;
      end loop;
    elsif p_action='review_submission' and p_input->>'status'='approved' then
      for item in select record_id,revision from public.provider_submission_items where submission_id=sid loop
        if not private.reference_claims_complete(item.record_id,item.revision,true) then raise exception 'PORTAL_REFERENCE_REVIEW_REQUIRED';end if;
      end loop;
    elsif p_action='review_field' then
      select c.* into claim from public.provider_reference_claims c join public.provider_submission_items i on i.record_id=c.record_id and i.revision=c.revision where i.submission_id=sid and c.record_id=rid and c.field=p_input->>'field';
      select * into s from public.source_records where id=claim.source_record_id;
      if claim.id is null or p_input->>'sourceUrl' is distinct from s.source_url then raise exception 'PORTAL_REFERENCE_CLAIMS_REQUIRED';end if;
      if p_input->>'status'='verified' and p_input->>'field'='body' and exists(select 1 from public.provider_records where id=rid and kind='accreditation') and s.source_type not in ('regulator','government','recognized_organization') then raise exception 'PORTAL_REFERENCE_INDEPENDENT_EVIDENCE';end if;
    end if;
  end if;
  return private.portal_command_before_reference(p_action,p_input);
end;$$;

create function public.portal_reference_command(p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;r public.provider_records;v public.provider_revisions;s public.source_records;c public.provider_reference_claims;o public.organizations;value jsonb;
begin
  if not private.portal_active() or not private.portal_admin() or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>60000 then raise exception 'PORTAL_DENIED';end if;
  if p_action='create_reference_organization' then
    insert into public.organizations(name,provider_type,source_kind,onboarding_origin,created_by) values(trim(p_input->>'name'),p_input->>'providerType','external','admin_reference',auth.uid()) returning * into o;
    perform private.portal_audit('reference.organization_created','organization',o.id,o.id,null,to_jsonb(o));return to_jsonb(o);
  elsif p_action='create_reference_source' then
    if length(trim(coalesce(p_input->>'name','')))<3 or private.catalog_public_url(p_input->>'url') is null or nullif(p_input->>'sourceType','') is null or nullif(p_input->>'collectedAt','') is null then raise exception 'PORTAL_REFERENCE_SOURCE_REQUIRED';end if;
    if (p_input->>'collectedAt')::timestamptz>now()+interval '5 minutes' or (p_input->>'reviewAfter')::date<(p_input->>'collectedAt')::timestamptz::date then raise exception 'PORTAL_INVALID';end if;
    insert into public.source_records(source_kind,source_name,source_url,source_type,retrieved_at,review_after,notes) values('external',trim(p_input->>'name'),p_input->>'url',p_input->>'sourceType',(p_input->>'collectedAt')::timestamptz,nullif(p_input->>'reviewAfter','')::date,coalesce(p_input->>'notes','')) returning * into s;
    perform private.portal_audit('reference.source_added','source',s.id,null,null,to_jsonb(s));return to_jsonb(s);
  elsif p_action='attach_reference_claim' then
    select * into r from public.provider_records where id=(p_input->>'recordId')::uuid for update;
    if not private.portal_reference(r.organization_id) or r.status not in ('draft','changes_requested') or r.revision is distinct from (p_input->>'expectedRevision')::integer then raise exception 'PORTAL_CONFLICT';end if;
    select * into v from public.provider_revisions where record_id=r.id and revision=r.revision;
    value:=case when p_input->>'field'='name' then to_jsonb(v.name) else v.data->(p_input->>'field') end;
    select * into s from public.source_records where id=(p_input->>'sourceId')::uuid;
    if value is null or value in ('null'::jsonb,'""'::jsonb,'[]'::jsonb) or s.source_kind is distinct from 'external' or s.source_type is null or private.catalog_public_url(s.source_url) is null or s.retrieved_at is null then raise exception 'PORTAL_REFERENCE_SOURCE_REQUIRED';end if;
    insert into public.provider_reference_claims(record_id,revision,organization_id,field,supported_value,source_record_id,evidence_summary,created_by) values(r.id,r.revision,r.organization_id,p_input->>'field',value,s.id,p_input->>'evidence',auth.uid()) returning * into c;
    perform private.portal_audit('reference.claim_attached',r.kind,r.id,r.organization_id,null,to_jsonb(c));return to_jsonb(c);
  end if;raise exception 'PORTAL_ACTION_INVALID';
end;$$;

-- Guard approval at the table boundary as well as the RPC, retaining the
-- pre-existing section-review trigger and identity/accreditation gates.
create function private.reference_submission_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare i record;begin
  if private.portal_reference(new.organization_id) and new.status in ('approved','published') then
    if not private.portal_admin() then raise exception 'PORTAL_DENIED';end if;
    for i in select record_id,revision from public.provider_submission_items where submission_id=new.id loop
      if not private.reference_claims_complete(i.record_id,i.revision,true) then raise exception 'PORTAL_REFERENCE_REVIEW_REQUIRED';end if;
    end loop;
  end if;return new;
end;$$;
create trigger reference_submission_gate before update on public.provider_submissions for each row execute function private.reference_submission_guard();

-- Sources referenced by immutable claims cannot be changed behind a review.
create function private.reference_source_guard() returns trigger language plpgsql set search_path='' as $$
begin if exists(select 1 from public.provider_reference_claims where source_record_id=old.id) and
  (new.source_kind,new.source_name,new.source_url,new.source_type,new.retrieved_at,new.review_after) is distinct from (old.source_kind,old.source_name,old.source_url,old.source_type,old.retrieved_at,old.review_after) then raise exception 'PORTAL_REFERENCE_SOURCE_IMMUTABLE';end if;return new;end;$$;
create trigger reference_source_immutable before update on public.source_records for each row execute function private.reference_source_guard();

-- Wrap the canonical projector, never skip its reference/role/identity checks.
alter function private.portal_project_record(uuid,integer) rename to portal_project_record_before_reference;
create function private.portal_project_record(p_record uuid,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare r public.provider_records;v public.provider_revisions;s public.source_records;ci uuid;begin
  select * into r from public.provider_records where id=p_record;
  select * into v from public.provider_revisions where record_id=p_record and revision=p_revision;
  if private.portal_reference(r.organization_id) and not private.reference_claims_complete(p_record,p_revision,true) then raise exception 'PORTAL_REFERENCE_REVIEW_REQUIRED';end if;
  if private.portal_reference(r.organization_id) and r.kind not in ('organization','location') and not exists(select 1 from public.provider_records l where l.id=(v.data->>'locationId')::uuid and l.organization_id=r.organization_id and l.kind='location' and private.portal_snapshot_published(l.id)) then
    -- A location in this same approved submission will be projected first.
    if not exists(select 1 from public.provider_records l where l.id=(v.data->>'locationId')::uuid and l.organization_id=r.organization_id and l.kind='location' and l.published_revision is not null and l.status='published') then raise exception 'PORTAL_REFERENCE_LOCATION_REQUIRED';end if;
  end if;
  perform private.portal_project_record_before_reference(p_record,p_revision);
  if private.portal_reference(r.organization_id) then
    select src.* into s from public.provider_reference_claims c join public.source_records src on src.id=c.source_record_id where c.record_id=p_record and c.revision=p_revision and c.field='name';
    update public.source_records set source_name=s.source_name,source_url=s.source_url,source_type=s.source_type,retrieved_at=s.retrieved_at,review_after=s.review_after,notes='MedBridge reference information collected from public sources. Publication is not clinical or accreditation verification.' where source_identifier='provider-record:'||p_record||':revision:'||p_revision;
    if r.kind='doctor' then
      select (lv.data->>'cityId')::uuid into ci from public.provider_records l join public.provider_revisions lv on lv.record_id=l.id and lv.revision=l.published_revision where l.id=(v.data->>'locationId')::uuid;
      update public.doctors set home_city_id=ci where id=(select canonical_id from public.provider_records where id=p_record);
    end if;
  end if;
end;$$;
-- Deterministic parent-before-child order, including exact branch locations.
do $$declare d text;begin
  d:=pg_get_functiondef('public.portal_publication_command(text,jsonb)'::regprocedure);
  d:=replace(d,'when ''organization'' then 0 when ''doctor'' then 2 when ''package'' then 3 else 1','when ''organization'' then 0 when ''location'' then 1 when ''doctor'' then 3 when ''package'' then 4 else 2');execute d;
  d:=pg_get_functiondef('private.catalog_governed(text,uuid,text,uuid)'::regprocedure);
  d:=replace(d,'o.source_kind=''first_party''','(o.source_kind=''first_party'' or (o.onboarding_origin=''admin_reference'' and private.reference_claims_complete(r.id,r.published_revision,true)))');execute d;
  d:=pg_get_functiondef('public.public_provider_profile(uuid)'::regprocedure);
  d:=replace(d,'source_kind=''first_party''','source_kind in (''first_party'',''external'')');
  d:=replace(d,'''facilityType'',v.data->''facilityType''','''facilityType'',v.data->''facilityType'',''locationCity'',(select lv.data->>''cityId'' from public.provider_records l join public.provider_revisions lv on lv.record_id=l.id and lv.revision=l.published_revision where l.id=nullif(v.data->>''locationId'','''')::uuid)');execute d;
  d:=pg_get_functiondef('public.public_catalog_provenance()'::regprocedure);
  d:=replace(d,'''origin'',case when exists','''origin'',case when exists(select 1 from public.provider_records r join public.organizations o on o.id=r.organization_id where r.canonical_id=c.id and r.kind in (''organization'',''doctor'',''package'') and o.onboarding_origin=''admin_reference'') then ''admin_reference'' when exists');execute d;
end;$$;

create function public.public_reference_claims(p_kind text,p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('section',r.kind,'name',v.name,'field',c.field,'sourceName',s.source_name,'sourceUrl',private.catalog_public_url(s.source_url),'sourceType',s.source_type,'collectedAt',s.retrieved_at,'reviewAfter',s.review_after,'status',f.status,'checkedAt',f.created_at,
    'freshness',case when s.review_after<current_date or f.expires_on<current_date then 'stale' when s.review_after<=current_date+14 then 'needs_review' else 'fresh' end)),'[]'::jsonb)
  from public.provider_records parent join public.organizations o on o.id=parent.organization_id
  join public.provider_records r on (case when p_kind='hospital' then r.organization_id=o.id else r.id=parent.id end)
  join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision
  join public.provider_reference_claims c on c.record_id=r.id and c.revision=r.published_revision
  join public.source_records s on s.id=c.source_record_id
  join lateral(select f.* from public.provider_field_reviews f where f.record_id=c.record_id and f.revision=c.revision and f.field=c.field order by f.sequence desc limit 1) f on true
  where parent.canonical_id=p_id and parent.kind=case p_kind when 'hospital' then 'organization' else p_kind end and p_kind in ('hospital','doctor','package')
  and o.onboarding_origin='admin_reference' and private.portal_snapshot_published(r.id)
  and private.catalog_public_visible(case p_kind when 'hospital' then 'hospitals' when 'doctor' then 'doctors' else 'packages' end,p_id);
$$;

-- Safe branch facts for the existing search repository. Each association is
-- taken from a frozen, published offering and its exact published location.
create function public.public_reference_locations() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('hospitalId',o.hospital_id,'kind',r.kind,'canonicalId',r.canonical_id,'city',city.name,'country',country.name,'recordId',r.id)),'[]'::jsonb)
  from public.provider_records r join public.organizations o on o.id=r.organization_id
  join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision
  join public.provider_records l on l.id=nullif(v.data->>'locationId','')::uuid and l.organization_id=o.id
  join public.provider_revisions lv on lv.record_id=l.id and lv.revision=l.published_revision
  join public.cities city on city.id=(lv.data->>'cityId')::uuid join public.countries country on country.id=city.country_id
  where o.onboarding_origin='admin_reference' and private.catalog_public_visible('hospitals',o.hospital_id)
  and private.portal_snapshot_published(r.id) and private.portal_snapshot_published(l.id)
  and private.reference_claims_complete(r.id,r.published_revision,true);
$$;

revoke all on function private.portal_reference(uuid),private.reference_validate_record(text,jsonb,boolean,uuid),private.reference_claims_complete(uuid,integer,boolean),private.portal_command_before_reference(text,jsonb),private.reference_submission_guard(),private.reference_source_guard(),private.portal_project_record_before_reference(uuid,integer),private.portal_project_record(uuid,integer) from public,anon,authenticated;
revoke all on function public.portal_command(text,jsonb),public.portal_reference_command(text,jsonb),public.public_reference_claims(text,uuid),public.public_reference_locations() from public;
grant execute on function public.portal_command(text,jsonb),public.portal_reference_command(text,jsonb) to authenticated;
grant execute on function public.public_reference_claims(text,uuid),public.public_reference_locations() to anon,authenticated;
