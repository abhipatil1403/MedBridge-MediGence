create function public.inquiry_command(p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
    -- A public reference is not an organization with an operational provider team.
    select r.organization_id,r.published_revision into org,rev from public.provider_records r join public.organizations o on o.id=r.organization_id
      where r.canonical_id=target and r.kind=case kind when 'hospital' then 'organization' else kind end and r.published_revision is not null
      and o.status='active' and o.onboarding_origin='provider_submitted' and o.source_kind<>'synthetic' order by r.id limit 1;
    if org is not null and not exists(select 1 from public.organization_members m where m.organization_id=org and m.active and not exists(select 1 from public.portal_accounts a where a.user_id=m.user_id and not a.active)) then org:=null;end if;
    if rev is null then select r.published_revision into rev from public.provider_records r where r.canonical_id=target and r.kind=case kind when 'hospital' then 'organization' else kind end and r.published_revision is not null order by r.id limit 1;end if;
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
      if c.status='waiting_patient' and v_owner then update public.support_cases set status='in_progress' where id=cid;end if;
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
      update public.support_cases set status='waiting_patient' where id=cid;
      perform private.inquiry_emit(cid,'inquiry.information_requested','Additional information requested.','patient');
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
        if c.organization_id is null or (p_input->>'organizationId')::uuid is distinct from c.organization_id or not exists(select 1 from public.organizations o where o.id=c.organization_id and o.status='active' and o.onboarding_origin='provider_submitted' and o.source_kind<>'synthetic') then raise exception 'INQUIRY_PROVIDER_UNAVAILABLE';end if;
        if exists(select 1 from public.support_case_provider_consents where case_id=cid and revoked_at is null) then raise exception 'PORTAL_CONFLICT';end if;
        insert into public.support_case_provider_consents(case_id,owner_id,organization_id,purpose) values(cid,uid,c.organization_id,purpose);
        update public.support_cases set share_with_provider=true,provider_response_status='pending' where id=cid;
        perform private.inquiry_emit(cid,'inquiry.provider_shared','Patient authorized the named provider organization for coordination.','shared');
      else
        update public.support_case_provider_consents set revoked_at=now() where case_id=cid and revoked_at is null;
        update public.support_document_grants set revoked_at=now() where case_id=cid and recipient='provider' and revoked_at is null;
        update public.support_cases set share_with_provider=false,provider_response_status='not_requested' where id=cid;
        perform private.inquiry_emit(cid,'inquiry.provider_revoked','Provider access revoked by the patient.','patient');
      end if;result:=jsonb_build_object('id',cid);
    elsif p_action='provider_response' then
      if not v_provider then raise exception 'PORTAL_DENIED';end if;
      ns:=p_input->>'status';body:=trim(p_input->>'body');
      if ns not in ('information_requested','responded','accepted_for_coordination','unable_to_coordinate') or length(body) not between 5 and 8000 then raise exception 'INQUIRY_INPUT_INVALID';end if;
      insert into public.support_case_messages(case_id,actor_id,body,visibility) values(cid,uid,body,'shared') returning id into rid;
      update public.support_cases set provider_response_status=ns,provider_responded_by=uid,provider_responded_at=now(),status=case when ns='information_requested' then 'waiting_patient' else 'in_progress' end where id=cid;
      perform private.inquiry_emit(cid,'inquiry.provider_response','Provider response received: '||replace(ns,'_',' ')||'.','shared');result:=jsonb_build_object('id',rid,'status',ns);
    elsif p_action='request_document' then
      if not (v_staff or v_provider) then raise exception 'PORTAL_DENIED';end if;
      vis:=case when v_provider then 'shared' else coalesce(p_input->>'visibility','patient') end;
      if vis not in ('patient','shared') or (vis='shared' and not c.share_with_provider) or length(trim(coalesce(p_input->>'title',''))) not between 3 and 180 or length(trim(coalesce(p_input->>'purpose',''))) not between 5 and 800 then raise exception 'INQUIRY_INPUT_INVALID';end if;
      insert into public.support_document_requests(case_id,requested_by,requesting_party,title,purpose,visibility) values(cid,uid,case when v_provider then 'provider' else 'support' end,trim(p_input->>'title'),trim(p_input->>'purpose'),vis) returning * into dr;
      update public.support_cases set status='waiting_patient' where id=cid;
      perform private.inquiry_emit(cid,'inquiry.document_requested','A coordination document was requested; review its stated purpose.','patient');result:=jsonb_build_object('id',dr.id);
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
        perform private.inquiry_emit(cid,'inquiry.document_shared','Patient shared a selected document with '||vis||' for the stated coordination purpose.','patient');
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
        perform private.inquiry_emit(cid,'inquiry.document_revoked','Patient withdrew document access.','patient');
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

-- Only a server that validated the actual file bytes can complete a reserved upload.
create function public.inquiry_commit_upload(p_actor uuid,p_document uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.support_case_documents;cid uuid;begin
  select * into d from public.support_case_documents where id=p_document;
  if not found or d.owner_id<>p_actor or exists(select 1 from public.portal_accounts where user_id=p_actor and not active) then raise exception 'PORTAL_DENIED';end if;
  select id into cid from public.support_cases where id=d.case_id and patient_id=p_actor and consent_revoked_at is null and status not in ('closed','cancelled','resolved') for update;
  if cid is null then raise exception 'PORTAL_DENIED';end if;
  select * into d from public.support_case_documents where id=p_document for update;
  if d.status<>'pending_upload' then return to_jsonb(d);end if;
  if not exists(select 1 from storage.objects where bucket_id='care-documents' and name=d.owner_id::text||'/'||d.case_id::text||'/'||d.id::text||case d.mime_type when 'application/pdf' then '.pdf' when 'image/png' then '.png' else '.jpg' end) then raise exception 'INQUIRY_FILE_NOT_STORED';end if;
  update public.support_case_documents set status='uploaded',uploaded_at=now(),updated_at=now() where id=d.id returning * into d;
  if d.request_id is not null then update public.support_document_requests set status='uploaded',updated_at=now() where id=d.request_id and case_id=cid;end if;
  if d.replaces_id is not null then
    update public.support_case_documents set status='withdrawn',updated_at=now() where id=d.replaces_id and case_id=cid and owner_id=p_actor;
    update public.support_document_grants set revoked_at=now() where document_id=d.replaces_id and revoked_at is null;
  end if;
  insert into public.support_case_events(case_id,actor_id,action,summary,visibility) values(cid,p_actor,'inquiry.document_uploaded','Private document uploaded. Sharing requires a separate confirmation.','patient');
  insert into public.audit_events(actor_id,actor_type,actor_role,event_name,entity_type,entity_id,metadata) values(p_actor,'patient','patient','inquiry.document_uploaded','support_case',cid,jsonb_build_object('documentId',d.id));
  update public.support_cases set revision=revision+1,updated_at=now() where id=cid;return to_jsonb(d);
end;$$;
revoke all on function public.inquiry_command(text,jsonb),public.inquiry_commit_upload(uuid,uuid) from public,anon,authenticated;
grant execute on function public.inquiry_command(text,jsonb) to authenticated;
grant execute on function public.inquiry_commit_upload(uuid,uuid) to service_role;

-- Old generic portal commands cannot bypass the richer inquiry guards.
alter function public.support_command(text,jsonb) rename to support_legacy_command;
revoke all on function public.support_legacy_command(text,jsonb) from public,anon,authenticated;
create function public.support_command(p_action text,p_input jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.support_cases;begin
  if nullif(p_input->>'caseId','') is not null then
    select * into c from public.support_cases where id=(p_input->>'caseId')::uuid;
    if c.inquiry_source<>'legacy' then
      return public.inquiry_command(case p_action when 'message' then 'message' when 'update_case' then 'update' when 'revoke_consent' then 'revoke_support' else p_action end,p_input);
    end if;
  end if;
  return public.support_legacy_command(p_action,p_input);
end;$$;
revoke all on function public.support_command(text,jsonb) from public,anon;
grant execute on function public.support_command(text,jsonb) to authenticated;
