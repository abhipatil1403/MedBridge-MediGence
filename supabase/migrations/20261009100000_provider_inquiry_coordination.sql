-- Extend the existing inquiry workflow; no new inbox, provider account or publication.
-- Existing messages retain unknown provenance rather than guessing historical roles.
alter table public.support_cases drop constraint if exists support_cases_provider_response_status_check;
alter table public.support_cases add constraint support_cases_provider_response_status_check
  check(provider_response_status in ('not_requested','pending','information_requested','responded','accepted_for_coordination','unable_to_coordinate','further_review'));
alter table public.support_cases add column if not exists provider_response_message_id uuid references public.support_case_messages(id),
  add column if not exists provider_information_requested_at timestamptz,add column if not exists provider_information_answered_at timestamptz;
alter table public.support_case_messages add column if not exists sender_role text check(sender_role in ('patient','support','provider')),
  add column if not exists sender_organization_id uuid references public.organizations(id);

-- Fail closed on ambiguity. Only exact, currently published canonical relationships
-- with an active operational member can be offered for new patient authorization.
create or replace function private.inquiry_connected_org(p_kind text,p_id uuid) returns uuid language sql stable security definer set search_path='' as $$
  select case when count(distinct r.organization_id)=1 then (array_agg(distinct r.organization_id))[1] end
  from public.provider_records r join public.organizations o on o.id=r.organization_id
  where r.canonical_id=p_id and r.kind=case p_kind when 'hospital' then 'organization' else p_kind end
    and r.published_revision is not null and private.portal_snapshot_published(r.id)
    and o.status='active' and o.onboarding_origin='provider_submitted' and o.source_kind<>'synthetic'
    and exists(select 1 from public.organization_members m where m.organization_id=o.id and m.active
      and not exists(select 1 from public.portal_accounts a where a.user_id=m.user_id and not a.active));
$$;
revoke all on function private.inquiry_connected_org(text,uuid) from public,anon,authenticated;

create or replace function private.inquiry_message_principal() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.support_cases;begin
  select * into c from public.support_cases where id=new.case_id;
  if c.inquiry_source='legacy' then return new;end if;
  if new.actor_id is distinct from auth.uid() then raise exception 'PORTAL_DENIED';end if;
  new.sender_role:=case when c.patient_id=auth.uid() then 'patient' when private.portal_case_staff(c.id) then 'support' else 'provider' end;
  if new.sender_role='provider' and not (c.share_with_provider and private.portal_member(c.organization_id)) then raise exception 'PORTAL_DENIED';end if;
  new.sender_organization_id:=case when new.sender_role='provider' then c.organization_id end;
  return new;
end;$$;
revoke all on function private.inquiry_message_principal() from public,anon,authenticated;
drop trigger if exists inquiry_message_principal on public.support_case_messages;
create trigger inquiry_message_principal before insert on public.support_case_messages for each row execute function private.inquiry_message_principal();

-- Keep organization in non-sensitive metadata, not organization_id: assigning the
-- latter would widen existing organization-wide audit RLS to patient/private events.
create or replace function private.inquiry_emit(p_case uuid,p_action text,p_summary text,p_visibility text) returns uuid language plpgsql security definer set search_path='' as $$
declare eid uuid;owner_id uuid;org_id uuid;actor_role text;begin
  select patient_id,organization_id into owner_id,org_id from public.support_cases where id=p_case;
  actor_role:=case when auth.uid()=owner_id then 'patient' when private.portal_case_staff(p_case) then private.portal_role() else (select role from public.organization_members where user_id=auth.uid() and organization_id=org_id and active) end;
  insert into public.support_case_events(case_id,actor_id,action,summary,visibility) values(p_case,auth.uid(),p_action,p_summary,p_visibility) returning id into eid;
  insert into public.audit_events(actor_id,actor_type,actor_role,event_name,entity_type,entity_id,metadata)
    values(auth.uid(),case when auth.uid()=owner_id then 'patient' when auth.uid() is null then 'system' else 'staff' end,coalesce(actor_role,'system'),p_action,'support_case',p_case,jsonb_build_object('organizationId',org_id,'eventId',eid,'visibility',p_visibility));
  perform private.support_notify(p_case,p_summary,p_visibility);return eid;
end;$$;

create or replace function public.inquiry_command(p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare uid uuid:=auth.uid();op uuid:=(p_input->>'operationId')::uuid;cid uuid:=nullif(p_input->>'caseId','')::uuid;
  c public.support_cases;d public.support_case_documents;dr public.support_document_requests;receipt public.support_operation_receipts;
  hid uuid;did uuid;pid uuid;org uuid;target uuid;eid uuid;rid uuid;rev integer;kind text;name text;slug text;vis text;ns text;body text;purpose text;
  result jsonb;snapshot jsonb;input_hash text:=md5(p_action||p_input::text);v_staff boolean;v_owner boolean;v_provider boolean;
begin
  if not private.portal_active() then raise exception 'PORTAL_DENIED';end if;
  if op is null or jsonb_typeof(p_input)<>'object' or length(p_input::text)>18000 then raise exception 'INQUIRY_INPUT_INVALID';end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text||op::text,0));
  select * into receipt from public.support_operation_receipts where actor_id=uid and operation_id=op;
  if found then
    if receipt.action<>p_action or receipt.input_hash<>input_hash then raise exception 'INQUIRY_RETRY_CONFLICT';end if;
    if not private.portal_case_access(receipt.case_id) then raise exception 'PORTAL_DENIED';end if;
    return receipt.result;
  end if;
  if p_action='create' then
    if p_input->>'consent' is distinct from 'true' or p_input->>'reviewed' is distinct from 'true' then raise exception 'PORTAL_CONSENT_REQUIRED';end if;
    if length(trim(coalesce(p_input->>'title',''))) not between 3 and 180 or length(trim(coalesce(p_input->>'objective',''))) not between 5 and 4000 then raise exception 'INQUIRY_INPUT_INVALID';end if;
    kind:=p_input->>'entityKind';target:=nullif(p_input->>'entityId','')::uuid;
    if kind is null or kind not in ('hospital','doctor','package') or target is null or not private.catalog_public_visible(kind,target) then raise exception 'INQUIRY_ENTITY_UNAVAILABLE';end if;
    if coalesce(p_input->>'source','help') not in ('hospital_detail','doctor_detail','package_detail','ai_finding','saved_item','help','recover') then raise exception 'INQUIRY_INPUT_INVALID';end if;
    if kind='hospital' then select h.id,h.name,h.slug into hid,name,slug from public.hospitals h where h.id=target;
    elsif kind='doctor' then select doc.id,doc.name,doc.slug into did,name,slug from public.doctors doc where doc.id=target;
    else select p.id,p.hospital_id,p.name,p.slug into pid,hid,name,slug from public.packages p where p.id=target;end if;
    org:=private.inquiry_connected_org(kind,target);
    select r.published_revision into rev from public.provider_records r where r.canonical_id=target and r.kind=case kind when 'hospital' then 'organization' else kind end and r.published_revision is not null and private.portal_snapshot_published(r.id) order by r.id limit 1;
    if not(p_input ? 'expectedPublishedRevision') or rev is distinct from (p_input->>'expectedPublishedRevision')::integer then raise exception 'PORTAL_CONFLICT';end if;
    if kind='doctor' and org is not null then select hospital_id into hid from public.organizations where id=org;end if;
    if hid is not null and not private.catalog_public_visible('hospital',hid) then raise exception 'INQUIRY_ENTITY_UNAVAILABLE';end if;
    snapshot:=jsonb_build_object('kind',kind,'id',target,'name',name,'href','/'||case kind when 'hospital' then 'hospitals' when 'doctor' then 'doctors' else 'packages' end||'/'||slug,'publishedRevision',rev,'recordedAt',now());
    if nullif(p_input->>'conversationId','') is not null and not exists(select 1 from public.conversations where id=(p_input->>'conversationId')::uuid and owner_id=uid) then raise exception 'PORTAL_DENIED';end if;
    insert into public.support_cases(patient_id,organization_id,hospital_id,doctor_id,package_id,title,description,inquiry_source,entity_snapshot,conversation_id,case_type,consent_granted_at)
      values(uid,org,hid,did,pid,trim(p_input->>'title'),trim(p_input->>'objective'),coalesce(p_input->>'source','help'),snapshot,nullif(p_input->>'conversationId','')::uuid,'coordination',now()) returning * into c;
    cid:=c.id;
    insert into public.consents(subject_id,consent_type,purpose,decision,granted_at,version,source,metadata)
      values(uid,'platform_support','Support may coordinate this inquiry using the reviewed request and selected public entity. Documents and provider access require separate consent.','granted',now(),'2','patient_inquiry',jsonb_build_object('supportCaseId',cid));
    perform private.inquiry_emit(cid,'inquiry.submitted','Request submitted to Support.','patient');
    insert into public.portal_notifications(user_id,title,resource_type,resource_id)
      select sr.user_id,'New assistance request','support_case',cid from public.staff_roles sr where sr.active and sr.role in ('support_manager','admin','super_admin') and sr.user_id<>uid
      and not exists(select 1 from public.portal_accounts a where a.user_id=sr.user_id and (not a.active or a.notification_preferences->>'in_app'='false'));
    result:=jsonb_build_object('id',cid,'status',c.status);
  else
    select * into c from public.support_cases where id=cid for update;
    if not found or not private.portal_case_access(cid) then raise exception 'PORTAL_DENIED';end if;
    v_owner:=c.patient_id=uid;v_staff:=private.portal_case_staff(cid);v_provider:=not v_owner and not v_staff and c.share_with_provider and private.portal_member(c.organization_id);
    if p_action not in ('revoke_support','revoke_provider','revoke_document','read_messages','cancel','link_recovery') and c.consent_revoked_at is not null then raise exception 'PORTAL_CONSENT_REQUIRED';end if;
    if p_action not in ('revoke_support','revoke_provider','revoke_document','read_messages','link_recovery') and c.status in ('resolved','closed','cancelled') and p_action<>'update' then raise exception 'PORTAL_TRANSITION_INVALID';end if;
    if p_action='message' then
      vis:=p_input->>'visibility';body:=trim(p_input->>'body');
      if vis not in ('patient','provider','shared','internal') or length(body) not between 1 and 8000 then raise exception 'INQUIRY_INPUT_INVALID';end if;
      if not v_staff and not ((v_owner and vis in ('patient','shared')) or (v_provider and vis in ('provider','shared'))) then raise exception 'PORTAL_DENIED';end if;
      if vis in ('provider','shared') and not c.share_with_provider then raise exception 'PORTAL_CONSENT_REQUIRED';end if;
      insert into public.support_case_messages(case_id,actor_id,body,visibility) values(cid,uid,body,vis) returning id into rid;
      if v_owner and vis='shared' and c.provider_response_status='information_requested' then
        update public.support_cases set provider_response_status='pending',provider_information_answered_at=now(),status='waiting_provider' where id=cid;
        perform private.inquiry_emit(cid,'inquiry.provider_information_answered','Patient replied to the provider information request.','shared');
      elsif c.status='waiting_patient' and v_owner and c.provider_response_status<>'information_requested' then update public.support_cases set status='in_progress' where id=cid;end if;
      perform private.inquiry_emit(cid,case when vis='internal' then 'inquiry.note_added' else 'inquiry.message_sent' end,case when vis='internal' then 'Internal Support note added.' else 'New inquiry message.' end,vis);
      result:=jsonb_build_object('id',rid);
    elsif p_action='update' then
      if not v_staff then raise exception 'PORTAL_DENIED';end if;
      if c.revision<>coalesce((p_input->>'expectedRevision')::integer,-1) then raise exception 'PORTAL_CONFLICT';end if;
      ns:=coalesce(p_input->>'status',c.status);
      if not private.inquiry_transition(c.status,ns,private.portal_manager()) then raise exception 'PORTAL_TRANSITION_INVALID';end if;
      if ns='waiting_provider' and not c.share_with_provider then raise exception 'PORTAL_CONSENT_REQUIRED';end if;
      if ns in ('resolved','closed') and ns<>c.status and length(trim(coalesce(p_input->>'resolution',''))) not between 5 and 4000 then raise exception 'INQUIRY_RESOLUTION_REQUIRED';end if;
      if ns='escalated' and length(trim(coalesce(p_input->>'reason','')))<5 then raise exception 'PORTAL_REVIEW_REASON_REQUIRED';end if;
      target:=case when p_input ? 'assignedTo' then nullif(p_input->>'assignedTo','')::uuid else c.assigned_to end;
      if target is distinct from c.assigned_to then
        if not private.portal_manager() and not (c.assigned_to is null and target=uid) then raise exception 'PORTAL_DENIED';end if;
        if target is not null and (not exists(select 1 from public.staff_roles sr where sr.user_id=target and sr.active and sr.role in ('support_agent','support_manager','admin','super_admin')) or exists(select 1 from public.portal_accounts where user_id=target and not active)) then raise exception 'PORTAL_ASSIGNEE_INVALID';end if;
      end if;
      update public.support_cases set status=ns,assigned_to=target,priority=coalesce(p_input->>'priority',priority),due_at=case when p_input ? 'dueAt' then nullif(p_input->>'dueAt','')::timestamptz else due_at end,
        resolution_summary=case when ns in ('resolved','closed') then coalesce(nullif(trim(p_input->>'resolution'),''),resolution_summary) when ns='open' then null else resolution_summary end,
        escalation_reason=case when ns='escalated' then p_input->>'reason' else escalation_reason end where id=cid;
      perform private.inquiry_emit(cid,'inquiry.status_changed','Request status: '||replace(ns,'_',' ')||'.',case when c.share_with_provider then 'shared' else 'patient' end);
      if target is distinct from c.assigned_to and target is not null and target<>uid then
        insert into public.portal_notifications(user_id,title,resource_type,resource_id) select target,'Assistance request assigned','support_case',cid where not exists(select 1 from public.portal_accounts where user_id=target and (not active or notification_preferences->>'in_app'='false'));
      end if;
      result:=jsonb_build_object('id',cid,'status',ns);
    elsif p_action='request_information' then
      if not (v_staff or v_provider) or length(trim(coalesce(p_input->>'body',''))) not between 5 and 8000 then raise exception 'PORTAL_DENIED';end if;
      insert into public.support_case_messages(case_id,actor_id,body,visibility) values(cid,uid,trim(p_input->>'body'),case when v_provider then 'shared' else 'patient' end) returning id into rid;
      update public.support_cases set status='waiting_patient',
        provider_response_status=case when v_provider then 'information_requested' else provider_response_status end,
        provider_response_message_id=case when v_provider then rid else provider_response_message_id end,
        provider_responded_by=case when v_provider then uid else provider_responded_by end,
        provider_responded_at=case when v_provider then now() else provider_responded_at end,
        provider_information_requested_at=case when v_provider then now() else provider_information_requested_at end,
        provider_information_answered_at=case when v_provider then null else provider_information_answered_at end where id=cid;
      perform private.inquiry_emit(cid,'inquiry.information_requested','Additional information requested.',case when v_provider then 'shared' else 'patient' end);
      result:=jsonb_build_object('id',rid);
    elsif p_action='cancel' then
      if not v_owner or c.status not in ('open','in_progress','waiting_patient','waiting_provider','escalated') then raise exception 'PORTAL_TRANSITION_INVALID';end if;
      update public.support_cases set status='cancelled',share_with_provider=false where id=cid;
      update public.support_case_provider_consents set revoked_at=now() where case_id=cid and revoked_at is null;
      update public.support_document_grants set revoked_at=now() where case_id=cid and revoked_at is null;
      perform private.inquiry_emit(cid,'inquiry.cancelled','Request cancelled by the patient.','patient');result:=jsonb_build_object('id',cid,'status','cancelled');
    elsif p_action='revoke_support' then
      if not v_owner then raise exception 'PORTAL_DENIED';end if;
      update public.support_cases set consent_revoked_at=now(),share_with_provider=false where id=cid;
      update public.support_case_provider_consents set revoked_at=now() where case_id=cid and revoked_at is null;
      update public.support_document_grants set revoked_at=now() where case_id=cid and revoked_at is null;
      insert into public.consents(subject_id,consent_type,purpose,decision,revoked_at,version,source,metadata) values(uid,'platform_support','Support and provider access revoked for this inquiry.','revoked',now(),'2','patient_inquiry',jsonb_build_object('supportCaseId',cid));
      perform private.inquiry_emit(cid,'inquiry.support_revoked','Support access revoked by the patient.','patient');result:=jsonb_build_object('id',cid);
    elsif p_action in ('share_provider','revoke_provider') then
      if not v_owner then raise exception 'PORTAL_DENIED';end if;
      if p_action='share_provider' then
        purpose:=trim(p_input->>'purpose');
        if p_input->>'confirmed' is distinct from 'true' or length(purpose) not between 5 and 400 then raise exception 'PORTAL_CONSENT_REQUIRED';end if;
        org:=private.inquiry_connected_org(c.entity_snapshot->>'kind',(c.entity_snapshot->>'id')::uuid);
        if org is null or (p_input->>'organizationId')::uuid is distinct from org or (c.organization_id is not null and c.organization_id<>org) then raise exception 'INQUIRY_PROVIDER_UNAVAILABLE';end if;
        -- A previously unconnected reference can gain a real team; binding happens
        -- only with this owner's explicit named-organization authorization.
        if c.organization_id is null then update public.support_cases set organization_id=org where id=cid;c.organization_id:=org;end if;
        if exists(select 1 from public.support_case_provider_consents where case_id=cid and revoked_at is null) then raise exception 'PORTAL_CONFLICT';end if;
        insert into public.support_case_provider_consents(case_id,owner_id,organization_id,purpose) values(cid,uid,c.organization_id,purpose);
        update public.support_cases set share_with_provider=true,provider_response_status='pending' where id=cid;
        perform private.inquiry_emit(cid,'inquiry.provider_shared','Patient authorized the named provider organization for coordination.','shared');
      else
        if c.share_with_provider then perform private.support_notify(cid,'Provider access withdrawn by the patient.','provider');end if;
        update public.support_case_provider_consents set revoked_at=now() where case_id=cid and revoked_at is null;
        update public.support_document_grants set revoked_at=now() where case_id=cid and recipient='provider' and revoked_at is null;
        update public.support_cases set share_with_provider=false,provider_response_status='not_requested' where id=cid;
        perform private.inquiry_emit(cid,'inquiry.provider_revoked','Provider access revoked by the patient.','patient');
      end if;result:=jsonb_build_object('id',cid);
    elsif p_action='provider_response' then
      if not v_provider then raise exception 'PORTAL_DENIED';end if;
      ns:=p_input->>'status';body:=trim(p_input->>'body');
      if p_input->>'confirmed' is distinct from 'true' then raise exception 'PORTAL_CONFIRMATION_REQUIRED';end if;
      if ns not in ('information_requested','responded','accepted_for_coordination','unable_to_coordinate','further_review') or length(body) not between 5 and 8000 then raise exception 'INQUIRY_INPUT_INVALID';end if;
      insert into public.support_case_messages(case_id,actor_id,body,visibility) values(cid,uid,body,'shared') returning id into rid;
      update public.support_cases set provider_response_status=ns,provider_response_message_id=rid,provider_responded_by=uid,provider_responded_at=now(),
        provider_information_requested_at=case when ns='information_requested' then now() else provider_information_requested_at end,
        provider_information_answered_at=case when ns='information_requested' then null else provider_information_answered_at end,
        status=case when ns='information_requested' then 'waiting_patient' else 'in_progress' end where id=cid;
      perform private.inquiry_emit(cid,'inquiry.provider_response','Provider response received: '||replace(ns,'_',' ')||'.','shared');result:=jsonb_build_object('id',rid,'status',ns);
    elsif p_action='request_document' then
      if not (v_staff or v_provider) then raise exception 'PORTAL_DENIED';end if;
      vis:=case when v_provider then 'shared' else coalesce(p_input->>'visibility','patient') end;
      if vis not in ('patient','shared') or (vis='shared' and not c.share_with_provider) or length(trim(coalesce(p_input->>'title',''))) not between 3 and 180 or length(trim(coalesce(p_input->>'purpose',''))) not between 5 and 800 then raise exception 'INQUIRY_INPUT_INVALID';end if;
      insert into public.support_document_requests(case_id,requested_by,requesting_party,title,purpose,visibility) values(cid,uid,case when v_provider then 'provider' else 'support' end,trim(p_input->>'title'),trim(p_input->>'purpose'),vis) returning * into dr;
      if v_provider then
        insert into public.support_case_messages(case_id,actor_id,body,visibility) values(cid,uid,'Document requested: '||dr.title||'. '||dr.purpose,'shared') returning id into rid;
      end if;
      update public.support_cases set status='waiting_patient',
        provider_response_status=case when v_provider then 'information_requested' else provider_response_status end,
        provider_response_message_id=case when v_provider then rid else provider_response_message_id end,
        provider_responded_by=case when v_provider then uid else provider_responded_by end,
        provider_responded_at=case when v_provider then now() else provider_responded_at end where id=cid;
      perform private.inquiry_emit(cid,'inquiry.document_requested','A coordination document was requested; review its stated purpose.',case when v_provider then 'shared' else 'patient' end);result:=jsonb_build_object('id',dr.id);
    elsif p_action='reserve_upload' then
      if not v_owner then raise exception 'PORTAL_DENIED';end if;
      if (select count(*) from public.support_case_documents where case_id=cid)>=100 then raise exception 'INQUIRY_DOCUMENT_LIMIT';end if;
      rid:=nullif(p_input->>'requestId','')::uuid;
      if rid is not null and not exists(select 1 from public.support_document_requests where id=rid and case_id=cid and status in ('requested','replacement_requested','uploaded')) then raise exception 'PORTAL_DENIED';end if;
      target:=nullif(p_input->>'replacesId','')::uuid;
      if target is not null and not exists(select 1 from public.support_case_documents where id=target and case_id=cid and owner_id=uid and status not in ('pending_upload','withdrawn')) then raise exception 'PORTAL_DENIED';end if;
      insert into public.support_case_documents(case_id,owner_id,request_id,replaces_id,filename,mime_type,size_bytes,checksum)
        values(cid,uid,rid,target,p_input->>'filename',p_input->>'mimeType',(p_input->>'sizeBytes')::integer,p_input->>'checksum') returning * into d;
      result:=to_jsonb(d);
    elsif p_action in ('share_document','revoke_document','withdraw_document','review_document') then
      select * into d from public.support_case_documents where id=(p_input->>'documentId')::uuid and case_id=cid for update;
      if not found or not private.inquiry_document_access(d.id) then raise exception 'PORTAL_DENIED';end if;
      if p_action='share_document' then
        purpose:=trim(p_input->>'purpose');vis:=p_input->>'recipient';
        if not v_owner or p_input->>'confirmed' is distinct from 'true' or d.status in ('pending_upload','withdrawn') or length(purpose) not between 5 and 400 or vis not in ('support','provider') then raise exception 'PORTAL_CONSENT_REQUIRED';end if;
        if vis='provider' and (not c.share_with_provider or c.organization_id is null or (p_input->>'organizationId')::uuid is distinct from c.organization_id) then raise exception 'PORTAL_CONSENT_REQUIRED';end if;
        if exists(select 1 from public.support_document_grants where document_id=d.id and recipient=vis and revoked_at is null) then raise exception 'PORTAL_CONFLICT';end if;
        insert into public.support_document_grants(document_id,case_id,owner_id,recipient,organization_id,purpose) values(d.id,cid,uid,vis,case when vis='provider' then c.organization_id end,purpose);
        perform private.inquiry_emit(cid,'inquiry.document_shared','Patient shared a selected document with '||vis||' for the stated coordination purpose.',case when vis='provider' then 'shared' else 'patient' end);
      elsif p_action='review_document' then
        if v_owner or not(v_staff or v_provider) or d.status in ('pending_upload','withdrawn') then raise exception 'PORTAL_DENIED';end if;
        ns:=p_input->>'status';body:=trim(coalesce(p_input->>'note',''));
        if ns not in ('under_review','accepted_for_coordination','replacement_requested') or length(body)>800 or (ns='replacement_requested' and length(body)<5) then raise exception 'INQUIRY_INPUT_INVALID';end if;
        update public.support_case_documents set status=ns,reviewed_by=uid,reviewed_at=now(),review_note=body,updated_at=now() where id=d.id;
        if d.request_id is not null and ns in ('accepted_for_coordination','replacement_requested') then update public.support_document_requests set status=ns,updated_at=now() where id=d.request_id;end if;
        perform private.inquiry_emit(cid,'inquiry.document_reviewed','Coordination document status: '||replace(ns,'_',' ')||'.','patient');
      else
        if not v_owner then raise exception 'PORTAL_DENIED';end if;
        if p_action='revoke_document' and p_input->>'recipient' not in ('support','provider') then raise exception 'INQUIRY_INPUT_INVALID';end if;
        update public.support_document_grants set revoked_at=now() where document_id=d.id and revoked_at is null and (p_action='withdraw_document' or recipient=p_input->>'recipient');
        if p_action='withdraw_document' then update public.support_case_documents set status='withdrawn',updated_at=now() where id=d.id;end if;
        perform private.inquiry_emit(cid,'inquiry.document_revoked','Patient withdrew document access.',case when c.share_with_provider then 'shared' else 'patient' end);
      end if;result:=jsonb_build_object('id',d.id);
    elsif p_action='save_task' then
      if not v_staff then raise exception 'PORTAL_DENIED';end if;
      body:=trim(coalesce(p_input->>'title',''));ns:=coalesce(p_input->>'status','open');target:=nullif(p_input->>'assignedTo','')::uuid;
      if length(body) not between 3 and 180 or ns not in ('open','in_progress','completed','cancelled') then raise exception 'INQUIRY_INPUT_INVALID';end if;
      if target is not null and not exists(select 1 from public.staff_roles sr where sr.user_id=target and sr.active and sr.role in ('support_agent','support_manager','admin','super_admin') and not exists(select 1 from public.portal_accounts where user_id=target and not active)) then raise exception 'PORTAL_ASSIGNEE_INVALID';end if;
      rid:=nullif(p_input->>'taskId','')::uuid;
      if rid is null then insert into public.support_tasks(case_id,title,assigned_to,due_at,priority,status,created_by) values(cid,body,target,nullif(p_input->>'dueAt','')::timestamptz,coalesce(p_input->>'priority','normal'),ns,uid) returning id into rid;
      else update public.support_tasks set title=body,assigned_to=target,due_at=nullif(p_input->>'dueAt','')::timestamptz,priority=coalesce(p_input->>'priority','normal'),status=ns,revision=revision+1,updated_at=now() where id=rid and case_id=cid and revision=(p_input->>'expectedRevision')::integer;if not found then raise exception 'PORTAL_CONFLICT';end if;end if;
      perform private.inquiry_emit(cid,'inquiry.task_saved','Support coordination task updated.','internal');result:=jsonb_build_object('id',rid);
    elsif p_action='read_messages' then
      insert into public.support_message_reads(case_id,user_id) values(cid,uid) on conflict(case_id,user_id) do update set read_at=now();result:=jsonb_build_object('id',cid);
    elsif p_action='link_recovery' then
      if not v_owner or p_input->>'confirmed' is distinct from 'true' then raise exception 'PORTAL_DENIED';end if;
      target:=(p_input->>'journeyId')::uuid;eid:=(p_input->>'eventId')::uuid;
      if not exists(select 1 from public.recovery_journeys where id=target and owner_id=uid and stage<>'archived') or not exists(select 1 from public.support_case_events e where e.id=eid and e.case_id=cid and private.portal_case_visibility(cid,e.visibility)) then raise exception 'PORTAL_DENIED';end if;
      body:=trim(p_input->>'title');if length(body) not between 3 and 160 then raise exception 'INQUIRY_INPUT_INVALID';end if;
      insert into public.recovery_tasks(journey_id,owner_id,title,support_case_id,support_event_id) values(target,uid,body,cid,eid)
        on conflict(owner_id,journey_id,support_event_id) where support_event_id is not null do nothing returning id into rid;
      if rid is null then select id into rid from public.recovery_tasks where owner_id=uid and journey_id=target and support_event_id=eid;
      else insert into public.recovery_events(journey_id,owner_id,title,event_type,source) values(target,uid,'User added an inquiry coordination task.','task_added','platform_action');end if;
      update public.support_cases set recovery_journey_id=target where id=cid;
      perform private.inquiry_emit(cid,'inquiry.recover_linked','Patient linked a coordination task to Recover.','patient');result:=jsonb_build_object('id',rid,'journeyId',target);
    else raise exception 'PORTAL_ACTION_INVALID';end if;
    if p_action<>'read_messages' then update public.support_cases set revision=revision+1,updated_at=now() where id=cid;end if;
  end if;
  insert into public.support_operation_receipts(actor_id,operation_id,action,input_hash,case_id,result) values(uid,op,p_action,input_hash,cid,result);
  return result;
end;$$;


create or replace function public.inquiry_target(p_kind text,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare n text;s text;r integer;oid uuid;oname text;begin
  if not private.portal_active() then raise exception 'PORTAL_DENIED';end if;
  if p_kind is null or p_kind not in ('hospital','doctor','package') or not private.catalog_public_visible(p_kind,p_id) then raise exception 'INQUIRY_ENTITY_UNAVAILABLE';end if;
  if p_kind='hospital' then select name,slug into n,s from public.hospitals where id=p_id;
  elsif p_kind='doctor' then select name,slug into n,s from public.doctors where id=p_id;
  else select name,slug into n,s from public.packages where id=p_id;end if;
  select pr.published_revision into r from public.provider_records pr where pr.canonical_id=p_id and pr.kind=case p_kind when 'hospital' then 'organization' else p_kind end and pr.published_revision is not null and private.portal_snapshot_published(pr.id) order by pr.id limit 1;
  oid:=private.inquiry_connected_org(p_kind,p_id);select name into oname from public.organizations where id=oid;
  return jsonb_build_object('kind',p_kind,'id',p_id,'name',n,'href','/'||case p_kind when 'hospital' then 'hospitals' when 'doctor' then 'doctors' else 'packages' end||'/'||s,'publishedRevision',r,'organizationId',oid,'organizationName',oname);
end;$$;

create or replace function public.inquiry_context(p_case_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.support_cases;own boolean;staff boolean;prov boolean;result jsonb;connected uuid;begin
  if not private.portal_case_access(p_case_id) then raise exception 'PORTAL_DENIED';end if;
  select * into c from public.support_cases where id=p_case_id;
  own:=c.patient_id=auth.uid();staff:=private.portal_case_staff(c.id);prov:=not own and not staff;
  connected:=private.inquiry_connected_org(c.entity_snapshot->>'kind',nullif(c.entity_snapshot->>'id','')::uuid);
  result:=jsonb_build_object(
    'case',jsonb_build_object('id',c.id,'title',c.title,'description',c.description,'status',c.status,'priority',c.priority,'assigned_to',case when staff then c.assigned_to end,'due_at',c.due_at,'revision',c.revision,'created_at',c.created_at,'updated_at',c.updated_at,'inquiry_source',c.inquiry_source,'entity_snapshot',c.entity_snapshot,'share_with_provider',c.share_with_provider,'consent_revoked_at',c.consent_revoked_at,'consent_granted_at',c.consent_granted_at,'resolution_summary',c.resolution_summary,'provider_response_status',c.provider_response_status,'provider_responded_at',c.provider_responded_at,'recovery_journey_id',case when own then c.recovery_journey_id end),
    'role',case when own then 'patient' when staff then 'support' else 'provider' end,
    'patient',jsonb_build_object('displayName',(select display_name from public.profiles where id=c.patient_id)),
    'organization',(select jsonb_build_object('id',id,'name',name) from public.organizations where id=coalesce(c.organization_id,connected)),
    'providerCoordination',jsonb_build_object('available',connected is not null and (c.organization_id is null or connected=c.organization_id),
      'informationRequestedAt',c.provider_information_requested_at,'informationAnsweredAt',c.provider_information_answered_at,
      'latestResponse',(select jsonb_build_object('id',m.id,'body',m.body,'createdAt',m.created_at,'responderName',coalesce(nullif(p.display_name,''),'Provider team member'),'organizationName',o.name)
        from public.support_case_messages m left join public.profiles p on p.id=m.actor_id left join public.organizations o on o.id=m.sender_organization_id
        where m.id=c.provider_response_message_id and m.case_id=c.id and m.sender_role='provider' and private.portal_case_visibility(c.id,m.visibility))),
    'messages',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from (select id,body,visibility,created_at,case when actor_id=c.patient_id then 'Patient' when m.sender_role='support' then 'Support' when m.sender_role='provider' then 'Provider' else 'Team member (earlier message)' end as sender from public.support_case_messages m where case_id=c.id and private.portal_case_visibility(c.id,visibility) order by created_at desc limit 200) x),'[]'),
    'events',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select id,action,summary,visibility,created_at from public.support_case_events where case_id=c.id and private.portal_case_visibility(c.id,visibility) order by created_at desc limit 200) x),'[]'),
    'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'filename',d.filename,'mime_type',d.mime_type,'size_bytes',d.size_bytes,'status',d.status,'uploaded_at',d.uploaded_at,'request_id',d.request_id,'review_note',d.review_note,'reviewed_at',d.reviewed_at,'grants',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'recipient',g.recipient,'purpose',g.purpose,'granted_at',g.granted_at,'revoked_at',g.revoked_at)) from public.support_document_grants g where g.document_id=d.id and (own or (g.revoked_at is null and ((staff and g.recipient='support') or (prov and g.recipient='provider'))))),'[]')) order by d.created_at desc) from public.support_case_documents d where d.case_id=c.id and private.inquiry_document_access(d.id)),'[]'),
    'documentRequests',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'purpose',purpose,'requesting_party',requesting_party,'status',status,'created_at',created_at) order by created_at desc) from public.support_document_requests where case_id=c.id and private.portal_case_visibility(c.id,visibility)),'[]'),
    'consents',coalesce((select jsonb_agg(jsonb_build_object('id',id,'purpose',purpose,'granted_at',granted_at,'revoked_at',revoked_at) order by granted_at desc) from public.support_case_provider_consents where case_id=c.id),'[]'),
    'staffDirectory',case when staff then public.portal_staff_directory() else '[]'::jsonb end,
    'tasks',case when staff then coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.support_tasks t where t.case_id=c.id),'[]') else '[]'::jsonb end,
    'journeys',case when own then coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title)) from public.recovery_journeys where owner_id=auth.uid() and stage<>'archived'),'[]') else '[]'::jsonb end,
    'unread', (select count(*) from public.support_case_messages m where case_id=c.id and actor_id<>auth.uid() and private.portal_case_visibility(c.id,visibility) and created_at>coalesce((select read_at from public.support_message_reads where case_id=c.id and user_id=auth.uid()),'-infinity'::timestamptz))
  );
  if staff then perform private.portal_audit('inquiry.staff_viewed','support_case',c.id,null,null,null);end if;
  return result;
end;$$;


-- Existing command/view ACLs are preserved by CREATE OR REPLACE.
