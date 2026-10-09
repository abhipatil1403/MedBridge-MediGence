-- Organization authority is distinct from account login and listing publication.
-- Existing organizations/members/documents/inquiries remain the source of truth.
alter table public.organizations add column if not exists verification_status text not null default 'not_submitted'
  check(verification_status in ('not_submitted','submitted','changes_requested','approved','rejected'));
create table if not exists public.organization_verification_requests (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  document_id uuid not null references public.provider_documents(id), requested_hospital_id uuid references public.hospitals(id),
  legal_name text not null check(length(legal_name) between 2 and 200), contact_name text not null check(length(contact_name) between 2 and 200),
  contact_email text not null check(length(contact_email)<=320), contact_phone text not null check(length(contact_phone) between 5 and 80),
  declaration text not null check(length(declaration) between 10 and 2000), status text not null default 'submitted' check(status in ('submitted','changes_requested','approved','rejected')),
  submitted_by uuid not null references auth.users(id), submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id), reviewed_at timestamptz, reason text check(length(reason) between 10 and 2000), contact_confirmation text check(length(contact_confirmation)<=2000)
);
alter table public.organizations add column if not exists verification_request_id uuid references public.organization_verification_requests(id);
-- Reference publishers and the operational owner can share a canonical hospital.
-- Only one non-reference organization may bind it; ownership approval is separate.
alter table public.organizations drop constraint if exists organizations_hospital_id_key;
create unique index if not exists operational_hospital_identity on public.organizations(hospital_id) where onboarding_origin<>'admin_reference';
create index if not exists organization_verification_queue on public.organization_verification_requests(status,submitted_at desc);
create index if not exists organization_verification_history on public.organization_verification_requests(organization_id,submitted_at desc);
-- A canonical record can have one current operational owner, independent of its
-- reference publisher. Reassignment/revocation retains the old association in audit.
create table if not exists public.provider_listing_ownership (
  entity_kind text not null check(entity_kind in ('hospital','doctor','package')), entity_id uuid not null,
  organization_id uuid not null references public.organizations(id), request_id uuid not null references public.organization_verification_requests(id),
  assigned_by uuid not null references auth.users(id), assigned_at timestamptz not null default now(), revoked_at timestamptz,
  primary key(entity_kind,entity_id)
);
create index if not exists provider_ownership_org on public.provider_listing_ownership(organization_id) where revoked_at is null;
create table if not exists public.portal_network_operations (
  actor_id uuid not null references auth.users(id), operation_id uuid not null, action text not null,input_hash text not null,
  organization_id uuid not null references public.organizations(id),result jsonb not null,created_at timestamptz not null default now(),
  primary key(actor_id,operation_id)
);
alter table public.organization_verification_requests enable row level security;
alter table public.provider_listing_ownership enable row level security;
alter table public.portal_network_operations enable row level security;
revoke all on public.organization_verification_requests,public.provider_listing_ownership,public.portal_network_operations from anon,authenticated;
grant select on public.organization_verification_requests,public.provider_listing_ownership to authenticated;
grant all on public.organization_verification_requests,public.provider_listing_ownership,public.portal_network_operations to service_role;
drop policy if exists organization_verification_read on public.organization_verification_requests;
create policy organization_verification_read on public.organization_verification_requests for select to authenticated
  using(private.portal_active() and (private.portal_admin() or private.portal_member(organization_id)));
drop policy if exists provider_ownership_read on public.provider_listing_ownership;
create policy provider_ownership_read on public.provider_listing_ownership for select to authenticated
  using(private.portal_active() and (private.portal_admin() or private.portal_member(organization_id)));

create or replace function private.provider_organization_approved(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.organizations o join public.organization_verification_requests v on v.id=o.verification_request_id and v.organization_id=o.id
    join public.provider_documents d on d.id=v.document_id and d.organization_id=o.id
    where o.id=p_org and o.status='active' and o.onboarding_origin='provider_submitted' and o.source_kind='first_party'
    and o.verification_status='approved' and v.status='approved' and v.reviewed_by is not null and length(v.contact_confirmation)>=10
    and d.status='approved' and (d.expires_on is null or d.expires_on>=current_date));
$$;
create or replace function private.provider_operational_member(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
  select private.portal_member(p_org) and private.provider_organization_approved(p_org);
$$;
create or replace function private.inquiry_connected_org(p_kind text,p_id uuid) returns uuid language sql stable security definer set search_path='' as $$
  with candidates as (
    select a.organization_id from public.provider_listing_ownership a join public.organizations o on o.id=a.organization_id where a.entity_kind=p_kind and a.entity_id=p_id and a.revoked_at is null and a.request_id=o.verification_request_id
      and (p_kind='hospital' or (p_kind='package' and exists(select 1 from public.packages p join public.provider_listing_ownership h on h.entity_kind='hospital' and h.entity_id=p.hospital_id and h.organization_id=a.organization_id and h.revoked_at is null and h.request_id=o.verification_request_id where p.id=p_id))
        or (p_kind='doctor' and exists(select 1 from public.hospital_doctors d join public.provider_listing_ownership h on h.entity_kind='hospital' and h.entity_id=d.hospital_id and h.organization_id=a.organization_id and h.revoked_at is null and h.request_id=o.verification_request_id where d.doctor_id=p_id)))
    union
    select r.organization_id from public.provider_records r where r.canonical_id=p_id and r.kind=case p_kind when 'hospital' then 'organization' else p_kind end
      and r.published_revision is not null and private.portal_snapshot_published(r.id)
      and not exists(select 1 from public.provider_listing_ownership a where a.entity_kind=p_kind and a.entity_id=p_id)
  ), eligible as (
    select distinct c.organization_id from candidates c where private.catalog_public_visible(p_kind,p_id) and private.provider_organization_approved(c.organization_id)
      and exists(select 1 from public.organization_members m where m.organization_id=c.organization_id and m.active
        and not exists(select 1 from public.portal_accounts a where a.user_id=m.user_id and not a.active))
  ) select case when count(*)=1 then (array_agg(organization_id))[1] end from eligible;
$$;
-- All case and file access checks re-evaluate current approval/membership; an
-- existing bearer session cannot retain access after suspension or revocation.
do $$declare fn text;definition text;begin
  foreach fn in array array['private.portal_case_access(uuid)','private.inquiry_document_access(uuid)','private.inquiry_message_principal()','public.inquiry_command(text,jsonb)'] loop
    definition:=pg_get_functiondef(fn::regprocedure);
    definition:=replace(definition,'private.portal_member(c.organization_id)','private.provider_operational_member(c.organization_id)');
    definition:=replace(definition,'private.portal_member(g.organization_id)','private.provider_operational_member(g.organization_id)');
    if fn='private.portal_case_access(uuid)' and position('private.inquiry_connected_org(c.entity_snapshot' in definition)=0 then
      definition:=replace(definition,'c.share_with_provider and private.provider_operational_member(c.organization_id)',
        'c.share_with_provider and private.provider_operational_member(c.organization_id) and (c.inquiry_source=''legacy'' or private.inquiry_connected_org(c.entity_snapshot->>''kind'',nullif(c.entity_snapshot->>''id'','''')::uuid)=c.organization_id)');
    end if;
    execute definition;
  end loop;
end;$$;

create or replace function public.portal_network_readiness(p_organization_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
  if not private.portal_active() then raise exception 'PORTAL_DENIED';end if;
  if p_organization_id is not null and not (coalesce(private.portal_role() in ('support_agent','support_manager','admin','super_admin'),false) or private.portal_member(p_organization_id)) then raise exception 'PORTAL_DENIED';end if;
  if p_organization_id is null and not coalesce(private.portal_role() in ('support_agent','support_manager','admin','super_admin'),false) then raise exception 'PORTAL_DENIED';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'status',o.status,'origin',o.onboarding_origin,
    'verificationStatus',o.verification_status,'ownershipApproved',private.provider_organization_approved(o.id),
    'activeMembers',(select count(*) from public.organization_members m where m.organization_id=o.id and m.active and not exists(select 1 from public.portal_accounts a where a.user_id=m.user_id and not a.active)),
    'ownedListings',(select count(*) from public.provider_listing_ownership a where a.organization_id=o.id and a.revoked_at is null),
    'publishedListings',(select count(*) from public.provider_listing_ownership a where a.organization_id=o.id and a.revoked_at is null and private.catalog_public_visible(a.entity_kind,a.entity_id)),
    'canReceiveInquiries',exists(select 1 from public.provider_listing_ownership a where a.organization_id=o.id and a.revoked_at is null and private.inquiry_connected_org(a.entity_kind,a.entity_id)=o.id)
      or exists(select 1 from public.provider_records r where r.organization_id=o.id and r.kind in ('organization','doctor','package') and private.inquiry_connected_org(case r.kind when 'organization' then 'hospital' else r.kind end,r.canonical_id)=o.id),
    'inAppNotifications',true,'externalDelivery',false,'requestId',o.verification_request_id)),'[]'::jsonb) into result
    from public.organizations o where o.status<>'archived' and (p_organization_id is null or o.id=p_organization_id);
  return jsonb_build_object('rows',result);
end;$$;

create or replace function public.portal_network_command(p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare uid uuid:=auth.uid();org uuid:=nullif(p_input->>'organizationId','')::uuid;op uuid:=nullif(p_input->>'operationId','')::uuid;
  req public.organization_verification_requests;o public.organizations;d public.provider_documents;r public.provider_records;
  old_row jsonb;result jsonb;hash text:=md5(p_action||p_input::text);receipt public.portal_network_operations;
  kind text;entity uuid;old_owner public.provider_listing_ownership;status text;reason text:=trim(coalesce(p_input->>'reason',''));
begin
  if not private.portal_active() or jsonb_typeof(p_input)<>'object' or length(p_input::text)>16000 or op is null then raise exception 'PORTAL_DENIED';end if;
  if not (private.portal_admin() or private.portal_member(org)) then raise exception 'PORTAL_DENIED';end if;
  if p_action='submit_organization_verification' then
    if not (private.portal_admin() or private.portal_member(org,true)) then raise exception 'PORTAL_DENIED';end if;
  elsif not private.portal_admin() then raise exception 'PORTAL_DENIED';end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text||op::text,0));
  select * into receipt from public.portal_network_operations where actor_id=uid and operation_id=op;
  if found then
    if receipt.action<>p_action or receipt.input_hash<>hash then raise exception 'INQUIRY_RETRY_CONFLICT';end if;
    return receipt.result;
  end if;
  select * into o from public.organizations where id=org for update;
  if not found or o.onboarding_origin<>'provider_submitted' or o.source_kind<>'first_party' then raise exception 'PORTAL_DENIED';end if;
  if p_action='submit_organization_verification' then
    if not (private.portal_member(org,true) or private.portal_admin()) or o.status<>'active' then raise exception 'PORTAL_DENIED';end if;
    if o.verification_status='submitted' or (o.verification_status='approved' and private.provider_organization_approved(org)) then raise exception 'PORTAL_TRANSITION_INVALID';end if;
    if p_input->'confirmed' is distinct from 'true'::jsonb or length(trim(coalesce(p_input->>'declaration','')))<10 then raise exception 'PORTAL_CONFIRMATION_REQUIRED';end if;
    if nullif(p_input->>'hospitalId','') is not null and not private.catalog_public_visible('hospital',(p_input->>'hospitalId')::uuid) then raise exception 'PORTAL_OWNERSHIP_SCOPE';end if;
    select doc.* into d from public.provider_documents doc where doc.id=(p_input->>'documentId')::uuid and doc.organization_id=org and doc.status not in ('archived','rejected','expired');
    if not found or d.expires_on<current_date then raise exception 'PORTAL_EVIDENCE_REQUIRED';end if;
    if length(trim(coalesce(p_input->>'legalName','')))<2 or length(trim(coalesce(p_input->>'contactName','')))<2 or length(trim(coalesce(p_input->>'contactPhone','')))<5
      or p_input->>'contactEmail' is null or p_input->>'contactEmail' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'PORTAL_INVALID';end if;
    insert into public.organization_verification_requests(organization_id,document_id,requested_hospital_id,legal_name,contact_name,contact_email,contact_phone,declaration,submitted_by)
      values(org,d.id,nullif(p_input->>'hospitalId','')::uuid,trim(p_input->>'legalName'),trim(p_input->>'contactName'),lower(trim(p_input->>'contactEmail')),trim(p_input->>'contactPhone'),trim(p_input->>'declaration'),uid) returning * into req;
    update public.organizations set verification_status='submitted',verification_request_id=req.id,updated_at=now() where id=org;
    perform private.portal_notify_staff('Organization ownership review','A provider submitted private authority evidence.','organization',org);
  elsif p_action='review_organization_verification' then
    if not private.portal_admin() then raise exception 'PORTAL_DENIED';end if;
    if p_input->'confirmed' is distinct from 'true'::jsonb then raise exception 'PORTAL_CONFIRMATION_REQUIRED';end if;
    select * into req from public.organization_verification_requests where id=(p_input->>'requestId')::uuid and organization_id=org for update;
    if not found or req.id is distinct from o.verification_request_id or req.status<>'submitted' then raise exception 'PORTAL_CONFLICT';end if;
    status:=p_input->>'status';
    if status is null or status not in ('approved','rejected','changes_requested') or length(reason) not between 10 and 2000 then raise exception 'PORTAL_REVIEW_REASON_REQUIRED';end if;
    if status='approved' then
      select * into d from public.provider_documents where id=req.document_id and organization_id=org;
      if d.status is distinct from 'approved' or d.expires_on<current_date then raise exception 'PORTAL_EVIDENCE_REQUIRED';end if;
      if length(trim(coalesce(p_input->>'contactConfirmation','')))<10 then raise exception 'PORTAL_CONTACT_CONFIRMATION_REQUIRED';end if;
    end if;
    old_row:=jsonb_build_object('status',req.status);
    update public.organization_verification_requests set status=status,reason=reason,contact_confirmation=case when status='approved' then trim(p_input->>'contactConfirmation') end,
      reviewed_by=uid,reviewed_at=now() where id=req.id returning * into req;
    update public.organizations set verification_status=status,updated_at=now() where id=org;
    perform private.portal_notify_org(org,'Organization ownership review updated','Open onboarding to read the review decision. Listing publication is separate.','organization',org);
  elsif p_action in ('assign_listing_ownership','revoke_listing_ownership') then
    if not private.portal_admin() then raise exception 'PORTAL_DENIED';end if;
    if p_input->'confirmed' is distinct from 'true'::jsonb then raise exception 'PORTAL_CONFIRMATION_REQUIRED';end if;
    if length(reason) not between 10 and 2000 then raise exception 'PORTAL_REVIEW_REASON_REQUIRED';end if;
    kind:=p_input->>'entityKind';entity:=(p_input->>'entityId')::uuid;
    if kind is null or kind not in ('hospital','doctor','package') or entity is null then raise exception 'PORTAL_INVALID';end if;
    perform pg_advisory_xact_lock(hashtextextended(kind||entity::text,0));
    select * into old_owner from public.provider_listing_ownership where entity_kind=kind and entity_id=entity for update;
    old_row:=to_jsonb(old_owner);
    if p_action='revoke_listing_ownership' then
      if old_owner.organization_id is distinct from org or old_owner.revoked_at is not null then raise exception 'PORTAL_CONFLICT';end if;
      update public.provider_listing_ownership set revoked_at=now() where entity_kind=kind and entity_id=entity;
    else
      if not private.provider_organization_approved(org) then raise exception 'PORTAL_ORGANIZATION_UNVERIFIED';end if;
      if old_owner.organization_id is not null and old_owner.revoked_at is null and old_owner.organization_id<>org then raise exception 'PORTAL_OWNERSHIP_CONFLICT';end if;
      if not private.catalog_public_visible(kind,entity) then raise exception 'INQUIRY_ENTITY_UNAVAILABLE';end if;
      if kind='hospital' and entity is distinct from (select requested_hospital_id from public.organization_verification_requests where id=o.verification_request_id) then raise exception 'PORTAL_OWNERSHIP_SCOPE';end if;
      if kind='package' and not exists(select 1 from public.packages p join public.provider_listing_ownership a on a.entity_kind='hospital' and a.entity_id=p.hospital_id and a.organization_id=org and a.revoked_at is null where p.id=entity) then raise exception 'PORTAL_OWNERSHIP_SCOPE';end if;
      if kind='doctor' and not exists(select 1 from public.hospital_doctors h join public.provider_listing_ownership a on a.entity_kind='hospital' and a.entity_id=h.hospital_id and a.organization_id=org and a.revoked_at is null where h.doctor_id=entity) then raise exception 'PORTAL_OWNERSHIP_SCOPE';end if;
      insert into public.provider_listing_ownership(entity_kind,entity_id,organization_id,request_id,assigned_by)
        values(kind,entity,org,o.verification_request_id,uid) on conflict(entity_kind,entity_id) do update set organization_id=org,request_id=excluded.request_id,assigned_by=uid,assigned_at=now(),revoked_at=null;
      -- Bind a private draft only when a matching kind was explicitly selected.
      -- No source snapshot or canonical catalog row is changed by ownership.
      if nullif(p_input->>'recordId','') is not null then
        select * into r from public.provider_records where id=(p_input->>'recordId')::uuid and organization_id=org for update;
        if not found or r.kind<>(case kind when 'hospital' then 'organization' else kind end) or r.published_revision is not null or (r.canonical_id is not null and r.canonical_id<>entity) then raise exception 'PORTAL_OWNERSHIP_SCOPE';end if;
        update public.provider_records set canonical_id=entity where id=r.id;
      end if;
    end if;
    perform private.portal_notify_org(org,'Listing ownership updated','Open onboarding for the exact canonical association. No listing was published by this action.','organization',org);
  else raise exception 'PORTAL_INVALID';end if;
  result:=jsonb_build_object('organizationId',org,'requestId',coalesce(req.id,o.verification_request_id),'status',coalesce(req.status,o.verification_status));
  -- Evidence, contact details and decision prose stay in the private review record.
  perform private.portal_audit('network.'||p_action,'organization',org,org,old_row,jsonb_build_object('requestId',req.id,'status',req.status,'entityKind',kind,'entityId',entity));
  insert into public.portal_network_operations(actor_id,operation_id,action,input_hash,organization_id,result) values(uid,op,p_action,hash,org,result);
  return result;
end;$$;

-- Gate first-party publication without changing reference/synthetic visibility.
do $$begin
  if to_regprocedure('private.portal_project_record_before_network(uuid,integer)') is null then
    alter function private.portal_project_record(uuid,integer) rename to portal_project_record_before_network;
  end if;
end;$$;
create or replace function private.portal_project_record(p_record uuid,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare r public.provider_records;o public.organizations;existing_owner public.organizations;begin
  select * into r from public.provider_records where id=p_record;select * into o from public.organizations where id=r.organization_id for update;
  if o.onboarding_origin='provider_submitted' and o.source_kind='first_party' then
    if not private.provider_organization_approved(o.id) then raise exception 'PORTAL_ORGANIZATION_UNVERIFIED';end if;
    if r.canonical_id is not null and r.kind in ('organization','doctor','package') then
      if not exists(select 1 from public.provider_listing_ownership a where a.entity_kind=case r.kind when 'organization' then 'hospital' else r.kind end and a.entity_id=r.canonical_id and a.organization_id=o.id and a.revoked_at is null and a.request_id=o.verification_request_id) then raise exception 'PORTAL_OWNERSHIP_SCOPE';end if;
      if r.kind='organization' then
        select * into existing_owner from public.organizations where hospital_id=r.canonical_id and id<>o.id and onboarding_origin<>'admin_reference' for update;
        if found then
          raise exception 'PORTAL_OWNERSHIP_CONFLICT';
        end if;
      end if;
    end if;
  end if;
  perform private.portal_project_record_before_network(p_record,p_revision);
  if o.onboarding_origin='provider_submitted' and o.source_kind='first_party' and r.kind in ('organization','doctor','package') then
    select * into r from public.provider_records where id=p_record;
    if r.kind='organization' then update public.hospitals set source_kind='first_party' where id=r.canonical_id;
    elsif r.kind='doctor' then update public.doctors set source_kind='first_party' where id=r.canonical_id;
    else update public.packages set source_kind='first_party' where id=r.canonical_id;end if;
    insert into public.provider_listing_ownership(entity_kind,entity_id,organization_id,request_id,assigned_by)
      values(case r.kind when 'organization' then 'hospital' else r.kind end,r.canonical_id,o.id,o.verification_request_id,auth.uid())
      on conflict(entity_kind,entity_id) do nothing;
  end if;
end;$$;
revoke all on function private.provider_organization_approved(uuid),private.provider_operational_member(uuid),private.portal_project_record(uuid,integer),private.portal_project_record_before_network(uuid,integer) from public,anon,authenticated;
revoke all on function public.portal_network_command(text,jsonb),public.portal_network_readiness(uuid) from public,anon;
grant execute on function public.portal_network_command(text,jsonb),public.portal_network_readiness(uuid) to authenticated;

-- Preserve the established team lifecycle, add notifications/confirmation and
-- optional operation receipts to its actual database entry point (not UI only).
do $$begin
  if to_regprocedure('private.portal_command_before_network(text,jsonb)') is null then
    alter function public.portal_command(text,jsonb) set schema private;
    alter function private.portal_command(text,jsonb) rename to portal_command_before_network;
  end if;
end;$$;
create or replace function public.portal_command(p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;org uuid:=nullif(p_input->>'organizationId','')::uuid;op uuid:=nullif(p_input->>'operationId','')::uuid;
  receipt public.portal_network_operations;hash text:=md5(p_action||p_input::text);begin
  if not private.portal_active() then raise exception 'PORTAL_DENIED';end if;
  if p_action in ('submit_organization_verification','review_organization_verification','assign_listing_ownership','revoke_listing_ownership') then return public.portal_network_command(p_action,p_input);end if;
  if op is not null and p_action in ('create_organization','invite_member','accept_invite','update_member','revoke_invite','organization_status') then
    perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||op::text,0));
    select * into receipt from public.portal_network_operations where actor_id=auth.uid() and operation_id=op;
    if found then
      if not(private.portal_admin() or private.portal_member(receipt.organization_id)) then raise exception 'PORTAL_DENIED';end if;
      if p_action in ('invite_member','update_member','revoke_invite') and not(private.portal_admin() or private.portal_member(receipt.organization_id,true)) then raise exception 'PORTAL_DENIED';end if;
      if p_action='organization_status' and not private.portal_admin() then raise exception 'PORTAL_DENIED';end if;
      if receipt.action<>p_action or receipt.input_hash<>hash then raise exception 'INQUIRY_RETRY_CONFLICT';end if;return receipt.result;
    end if;
  end if;
  result:=private.portal_command_before_network(p_action,p_input);
  -- A denied confirmation rolls back the delegated mutation and its audit.
  if p_action in ('update_member','revoke_invite','organization_status') and p_input->'confirmed' is distinct from 'true'::jsonb then raise exception 'PORTAL_CONFIRMATION_REQUIRED';end if;
  if p_action='organization_status' and length(trim(coalesce(p_input->>'reason','')))<10 then raise exception 'PORTAL_REVIEW_REASON_REQUIRED';end if;
  if p_action='create_organization' then
    org:=(result->>'id')::uuid;
    perform private.portal_notify_staff('Organization registered','A private workspace was registered. Ownership and publication are not yet approved.','organization',org);
  elsif p_action in ('accept_invite','revoke_invite') then
    select organization_id into org from public.organization_invites where id=(p_input->>'inviteId')::uuid;
  end if;
  if p_action in ('invite_member','accept_invite','update_member','revoke_invite','organization_status') then
    perform private.portal_notify_org(org,'Organization access updated','Open Team or onboarding for the current access state. This is an in-app notification.','organization',org);
    perform private.portal_audit('network.access_changed','organization',org,org,null,jsonb_build_object('action',p_action,'reason',case when p_action='organization_status' then trim(p_input->>'reason') end));
  end if;
  if op is not null and p_action in ('create_organization','invite_member','accept_invite','update_member','revoke_invite','organization_status') then
    insert into public.portal_network_operations(actor_id,operation_id,action,input_hash,organization_id,result) values(auth.uid(),op,p_action,hash,org,result);
  end if;return result;
end;$$;
revoke all on function private.portal_command_before_network(text,jsonb) from public,anon,authenticated;
revoke all on function public.portal_command(text,jsonb) from public,anon;
grant execute on function public.portal_command(text,jsonb) to authenticated;

-- Staff receive a safe explanation, without registrant identity or evidence.
create or replace function private.provider_connectivity(p_kind text,p_id uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare owner uuid;o public.organizations;hospital uuid;begin
  if private.inquiry_connected_org(p_kind,p_id) is not null then return 'connected';end if;
  select organization_id into owner from public.provider_listing_ownership where entity_kind=p_kind and entity_id=p_id and revoked_at is null;
  if owner is not null then
    select * into o from public.organizations where id=owner;
    if o.status<>'active' then return 'access_suspended';end if;
    if not private.provider_organization_approved(owner) then return 'authority_pending';end if;
    if not exists(select 1 from public.organization_members m where m.organization_id=owner and m.active and not exists(select 1 from public.portal_accounts a where a.user_id=m.user_id and not a.active)) then return 'no_authorized_team';end if;
    return 'listing_unavailable';
  end if;
  hospital:=case p_kind when 'hospital' then p_id when 'package' then (select hospital_id from public.packages where id=p_id) end;
  if exists(select 1 from public.organization_verification_requests v join public.organizations o on o.verification_request_id=v.id where v.requested_hospital_id=hospital and o.status='active' and v.status in ('submitted','changes_requested')) then return 'authority_pending';end if;
  if exists(select 1 from public.organization_verification_requests v join public.organizations o on o.verification_request_id=v.id where v.requested_hospital_id=hospital and private.provider_organization_approved(o.id)) then return 'ownership_pending';end if;
  return 'no_owner';
end;$$;
do $$declare definition text;begin
  definition:=pg_get_functiondef('public.inquiry_context(uuid)'::regprocedure);
  if position('private.provider_connectivity(' in definition)=0 then
    definition:=replace(definition,'''informationRequestedAt'',c.provider_information_requested_at', '''readiness'',case when staff then private.provider_connectivity(c.entity_snapshot->>''kind'',nullif(c.entity_snapshot->>''id'','''')::uuid) end,''informationRequestedAt'',c.provider_information_requested_at');
    execute definition;
  end if;
end;$$;
revoke all on function private.provider_connectivity(text,uuid) from public,anon,authenticated;
