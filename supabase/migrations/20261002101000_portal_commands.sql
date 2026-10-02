create function private.portal_reviewer(p_submission uuid) returns boolean language sql stable security definer set search_path='' as $$
  select private.portal_admin() or exists(select 1 from public.provider_submissions where id=p_submission and reviewer_id=auth.uid() and private.portal_role() in ('support_agent','support_manager'));
$$;
create function private.portal_org_reviewer(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.provider_submissions where organization_id=p_org and reviewer_id=auth.uid() and private.portal_role() in ('support_agent','support_manager'));
$$;
create policy assigned_review_org on public.organizations for select to authenticated using(private.portal_org_reviewer(id));
create policy assigned_review_records on public.provider_records for select to authenticated using(exists(select 1 from public.provider_submission_items i where i.record_id=id and private.portal_reviewer(i.submission_id)));
create policy assigned_review_revisions on public.provider_revisions for select to authenticated using(exists(select 1 from public.provider_submission_items i where i.record_id=provider_revisions.record_id and i.revision=provider_revisions.revision and private.portal_reviewer(i.submission_id)));
create policy assigned_review_submissions on public.provider_submissions for select to authenticated using(private.portal_reviewer(id));
create policy assigned_review_items on public.provider_submission_items for select to authenticated using(private.portal_reviewer(submission_id));
create policy assigned_review_documents on public.provider_documents for select to authenticated using(private.portal_org_reviewer(organization_id));
create policy assigned_review_fields on public.provider_field_reviews for select to authenticated using(private.portal_org_reviewer(organization_id));

create function private.portal_validate_record(p_kind text,p_data jsonb,p_submit boolean default false) returns void language plpgsql set search_path='' as $$
declare required_field text;
begin
  if jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>50000 then raise exception 'PORTAL_INVALID';end if;
  if nullif(p_data->>'website','') is not null and p_data->>'website' !~ '^https://[^[:space:]]+$' then raise exception 'PORTAL_INVALID';end if;
  if nullif(p_data->>'experienceYears','') is not null and (p_data->>'experienceYears')::integer not between 0 and 80 then raise exception 'PORTAL_INVALID';end if;
  if nullif(p_data->>'quantity','') is not null and (p_data->>'quantity')::integer<0 then raise exception 'PORTAL_INVALID';end if;
  if p_kind='organization' and p_submit then
    for required_field in select jsonb_array_elements_text(value) from public.portal_settings where key='provider_required_fields' loop
      if required_field<>'name' and length(trim(coalesce(p_data->>required_field,'')))=0 then raise exception 'PORTAL_PROFILE_REQUIRED';end if;
    end loop;
    if length(coalesce(p_data->>'description',''))<10 or (nullif(p_data->>'email','') is not null and p_data->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
      or not exists(select 1 from public.cities c join public.countries co on co.id=c.country_id where c.id=(p_data->>'cityId')::uuid and co.publication_status='published') then raise exception 'PORTAL_PROFILE_REQUIRED';end if;
  elsif p_kind in ('specialty','treatment') and p_submit then
    if p_kind='specialty' and not exists(select 1 from public.specialties where id=(p_data->>'specialtyId')::uuid) then raise exception 'PORTAL_CATALOG_REQUIRED';end if;
    if p_kind='treatment' and not exists(select 1 from public.treatments where id=(p_data->>'treatmentId')::uuid and publication_status='published') then raise exception 'PORTAL_CATALOG_REQUIRED';end if;
  elsif p_kind='package' then
    if p_data ? 'price' and (p_data->>'price')::numeric<0 then raise exception 'PORTAL_INVALID';end if;
    if p_data ? 'durationDays' and (p_data->>'durationDays')::integer<1 then raise exception 'PORTAL_INVALID';end if;
    if p_submit and (coalesce(p_data->>'currency','') !~ '^[A-Z]{3}$' or not (p_data ? 'price') or not (p_data ? 'durationDays')
      or length(coalesce(p_data->>'description',''))<10 or not exists(select 1 from public.treatments where id=(p_data->>'treatmentId')::uuid and publication_status='published')) then raise exception 'PORTAL_PACKAGE_REQUIRED';end if;
    if nullif(p_data->>'validUntil','') is not null and (p_data->>'validUntil')::date<coalesce(nullif(p_data->>'validFrom','')::date,current_date) then raise exception 'PORTAL_INVALID';end if;
  elsif p_kind='doctor' and p_submit then
    if not exists(select 1 from public.specialties where id=(p_data->>'specialtyId')::uuid) or length(coalesce(p_data->>'biography',''))<10
      or coalesce(p_data->>'consultationMode','') not in ('video','in-person','both') then raise exception 'PORTAL_DOCTOR_REQUIRED';end if;
  elsif p_kind='location' and p_submit then
    if length(coalesce(p_data->>'address',''))<3 or not exists(select 1 from public.cities where id=(p_data->>'cityId')::uuid) then raise exception 'PORTAL_LOCATION_REQUIRED';end if;
  elsif p_kind='facility' and p_submit then
    if coalesce(p_data->>'facilityType','')='' then raise exception 'PORTAL_INVALID';end if;
  elsif p_kind='accreditation' and p_submit then
    if coalesce(p_data->>'body','')='' or coalesce(p_data->>'documentId','')='' then raise exception 'PORTAL_EVIDENCE_REQUIRED';end if;
  end if;
end;$$;

create function public.portal_command(p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  uid uuid:=auth.uid(); org uuid; rid uuid; sid uuid; target uuid; rev integer; v_role text:=private.portal_role();
  r public.provider_records; s public.provider_submissions; o public.organizations; d public.provider_documents;
  old_row jsonb; result jsonb; item record; msg text:=coalesce(p_input->>'message',''); new_status text;
begin
  if not private.portal_active() or jsonb_typeof(p_input)<>'object' then raise exception 'PORTAL_DENIED';end if;
  org:=nullif(p_input->>'organizationId','')::uuid;rid:=nullif(p_input->>'recordId','')::uuid;sid:=nullif(p_input->>'submissionId','')::uuid;
  if p_action='create_organization' then
    if (select count(*) from public.organizations where created_by=uid and status='active')>=5 then raise exception 'PORTAL_ORGANIZATION_LIMIT';end if;
    insert into public.organizations(name,legal_name,provider_type,source_kind,created_by)
      values(trim(p_input->>'name'),coalesce(p_input->>'legalName',''),p_input->>'providerType',coalesce(p_input->>'sourceKind','first_party'),uid) returning * into o;
    insert into public.organization_members(organization_id,user_id,role) values(o.id,uid,'provider_admin');
    perform private.portal_audit('organization.created','organization',o.id,o.id,null,to_jsonb(o));return to_jsonb(o);
  elsif p_action='save_record' then
    if not(private.portal_member(org) or private.portal_admin()) then raise exception 'PORTAL_DENIED';end if;
    perform private.portal_validate_record(p_input->>'kind',p_input->'data');
    if rid is null then
      insert into public.provider_records(organization_id,kind,name,data,created_by,updated_by) values(org,p_input->>'kind',trim(p_input->>'name'),p_input->'data',uid,uid) returning * into r;
    else
      select * into r from public.provider_records where id=rid and organization_id=org for update;
      if not found then raise exception 'PORTAL_NOT_FOUND';end if;
      if r.revision<>coalesce((p_input->>'expectedRevision')::integer,-1) then raise exception 'PORTAL_CONFLICT';end if;
      if r.kind<>p_input->>'kind' or r.status in ('submitted','under_review','archived') then raise exception 'PORTAL_RECORD_LOCKED';end if;
      old_row:=to_jsonb(r);
      update public.provider_records set name=trim(p_input->>'name'),data=p_input->'data',revision=revision+1,status='draft',updated_by=uid,updated_at=now() where id=rid returning * into r;
    end if;
    insert into public.provider_revisions(record_id,revision,organization_id,name,data,created_by) values(r.id,r.revision,r.organization_id,r.name,r.data,uid);
    perform private.portal_audit('record.saved',r.kind,r.id,org,old_row,to_jsonb(r));return to_jsonb(r);
  elsif p_action='duplicate_record' then
    select * into r from public.provider_records where id=rid for update;
    if not found then raise exception 'PORTAL_NOT_FOUND';end if;org:=r.organization_id;
    if not(private.portal_member(org) or private.portal_admin()) or r.kind='organization' then raise exception 'PORTAL_DENIED';end if;
    insert into public.provider_records(organization_id,kind,name,data,created_by,updated_by) values(org,r.kind,left(r.name||' · copy',180),r.data,uid,uid) returning * into r;
    insert into public.provider_revisions(record_id,revision,organization_id,name,data,created_by) values(r.id,1,org,r.name,r.data,uid);
    perform private.portal_audit('record.duplicated',r.kind,r.id,org,null,to_jsonb(r));return to_jsonb(r);
  elsif p_action='submit' then
    if not(private.portal_member(org) or private.portal_admin()) then raise exception 'PORTAL_DENIED';end if;
    select * into o from public.organizations where id=org for update;
    if not found or o.status<>'active' then raise exception 'PORTAL_DENIED';end if;
    if not exists(select 1 from public.provider_records where organization_id=org and kind='organization') then raise exception 'PORTAL_PROFILE_REQUIRED';end if;
    if not exists(select 1 from public.provider_records where organization_id=org and status in ('draft','changes_requested') and (rid is null or id=rid)) then raise exception 'PORTAL_NOTHING_TO_SUBMIT';end if;
    insert into public.provider_submissions(organization_id,submitted_by,message) values(org,uid,msg) returning * into s;
    for r in select * from public.provider_records where organization_id=org and status in ('draft','changes_requested') and (rid is null or id=rid) for update loop
      perform private.portal_validate_record(r.kind,r.data,true);
      if r.kind='accreditation' and not exists(select 1 from public.provider_documents where id=(r.data->>'documentId')::uuid and organization_id=org and status not in ('archived','rejected','expired')) then raise exception 'PORTAL_EVIDENCE_REQUIRED';end if;
      insert into public.provider_submission_items(submission_id,record_id,revision) values(s.id,r.id,r.revision);
      update public.provider_records set status='submitted',updated_at=now() where id=r.id;
    end loop;
    perform private.portal_audit('submission.submitted','submission',s.id,org,null,to_jsonb(s));
    perform private.portal_notify_staff('Provider submission',o.name,'submission',s.id);
    perform private.portal_notify_org(org,'Submission received','Your immutable revision is ready for review.','submission',s.id);return to_jsonb(s);
  elsif p_action='assign_reviewer' then
    if not private.portal_admin() then raise exception 'PORTAL_DENIED';end if;
    target:=(p_input->>'userId')::uuid;
    if not exists(select 1 from public.staff_roles where user_id=target and active) then raise exception 'PORTAL_ASSIGNEE_INVALID';end if;
    select * into s from public.provider_submissions where id=sid for update;if not found then raise exception 'PORTAL_NOT_FOUND';end if;
    old_row:=to_jsonb(s);update public.provider_submissions set reviewer_id=target,updated_at=now() where id=sid returning * into s;
    perform private.portal_audit('submission.assigned','submission',sid,s.organization_id,old_row,to_jsonb(s));return to_jsonb(s);
  elsif p_action='review_submission' then
    if not private.portal_reviewer(sid) then raise exception 'PORTAL_DENIED';end if;
    select * into s from public.provider_submissions where id=sid for update;if not found then raise exception 'PORTAL_NOT_FOUND';end if;
    if s.status not in ('submitted','under_review') then raise exception 'PORTAL_TRANSITION_INVALID';end if;
    new_status:=p_input->>'status';
    if new_status not in ('under_review','changes_requested','approved','rejected') or (new_status in ('changes_requested','rejected') and length(trim(msg))<5) then raise exception 'PORTAL_REVIEW_REASON_REQUIRED';end if;
    for item in select i.* from public.provider_submission_items i where i.submission_id=sid loop
      select * into r from public.provider_records where id=item.record_id for update;
      if r.revision<>item.revision then raise exception 'PORTAL_CONFLICT';end if;
      update public.provider_records set status=new_status,updated_at=now() where id=r.id;
    end loop;
    old_row:=to_jsonb(s);update public.provider_submissions set status=new_status,reviewer_id=uid,review_message=msg,updated_at=now() where id=sid returning * into s;
    perform private.portal_audit('submission.'||new_status,'submission',sid,s.organization_id,old_row,to_jsonb(s));
    perform private.portal_notify_org(s.organization_id,replace(new_status,'_',' '),msg,'submission',sid);return to_jsonb(s);
  elsif p_action='review_field' then
    if not private.portal_reviewer(sid) then raise exception 'PORTAL_DENIED';end if;
    select pr.* into r from public.provider_records pr join public.provider_submission_items i on i.record_id=pr.id and i.revision=pr.revision where i.submission_id=sid and pr.id=rid;
    if not found then raise exception 'PORTAL_NOT_FOUND';end if;
    if p_input->>'status'='verified' and exists(select 1 from public.organizations where id=r.organization_id and source_kind='synthetic') then raise exception 'PORTAL_SYNTHETIC_NOT_VERIFIABLE';end if;
    if nullif(p_input->>'documentId','') is not null and not exists(select 1 from public.provider_documents where id=(p_input->>'documentId')::uuid and organization_id=r.organization_id and status='approved' and (expires_on is null or expires_on>=current_date)) then raise exception 'PORTAL_EVIDENCE_REQUIRED';end if;
    insert into public.provider_field_reviews(record_id,revision,organization_id,field,status,evidence,source_url,document_id,expires_on,reviewed_by)
      values(rid,r.revision,r.organization_id,p_input->>'field',p_input->>'status',coalesce(p_input->>'evidence',''),nullif(p_input->>'sourceUrl',''),nullif(p_input->>'documentId','')::uuid,nullif(p_input->>'expiresOn','')::date,uid) returning to_jsonb(provider_field_reviews.*) into result;
    perform private.portal_audit('field.reviewed',r.kind,rid,r.organization_id,null,result);
    perform private.portal_notify_org(r.organization_id,'Field review updated',p_input->>'field','record',rid);return result;
  elsif p_action='invite_member' then
    if not(private.portal_member(org,true) or private.portal_admin()) then raise exception 'PORTAL_DENIED';end if;
    if p_input->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'PORTAL_INVALID';end if;
    insert into public.organization_invites(organization_id,email,role,invited_by) values(org,lower(trim(p_input->>'email')),p_input->>'role',uid) returning to_jsonb(organization_invites.*) into result;
    perform private.portal_audit('member.invited','invitation',(result->>'id')::uuid,org,null,result);return result;
  elsif p_action='accept_invite' then
    select organization_id,role into org,new_status from public.organization_invites where id=(p_input->>'inviteId')::uuid
      and email=(select lower(email) from auth.users where id=uid) and expires_at>now() and revoked_at is null and accepted_by is null for update;
    if not found then raise exception 'PORTAL_INVITE_INVALID';end if;
    if not exists(select 1 from public.organizations where id=org and status='active') then raise exception 'PORTAL_DENIED';end if;
    insert into public.organization_members(organization_id,user_id,role) values(org,uid,new_status) on conflict(organization_id,user_id) do update set role=excluded.role,active=true;
    update public.organization_invites set accepted_by=uid where id=(p_input->>'inviteId')::uuid;
    perform private.portal_audit('member.joined','member',uid,org,null,jsonb_build_object('role',new_status));return jsonb_build_object('organizationId',org);
  elsif p_action='update_member' then
    if not(private.portal_member(org,true) or private.portal_admin()) then raise exception 'PORTAL_DENIED';end if;
    perform 1 from public.organizations where id=org for update;target:=(p_input->>'userId')::uuid;
    if (not (p_input->>'active')::boolean or p_input->>'role'<>'provider_admin') and exists(select 1 from public.organization_members where organization_id=org and user_id=target and active and role='provider_admin')
      and (select count(*) from public.organization_members where organization_id=org and active and role='provider_admin')<=1 then raise exception 'PORTAL_LAST_ADMIN';end if;
    select to_jsonb(m) into old_row from public.organization_members m where organization_id=org and user_id=target;
    update public.organization_members set active=(p_input->>'active')::boolean,role=p_input->>'role' where organization_id=org and user_id=target returning to_jsonb(organization_members.*) into result;
    if result is null then raise exception 'PORTAL_NOT_FOUND';end if;
    perform private.portal_audit('member.updated','member',target,org,old_row,result);return result;
  elsif p_action='revoke_invite' then
    select organization_id into org from public.organization_invites where id=(p_input->>'inviteId')::uuid for update;
    if not(private.portal_member(org,true) or private.portal_admin()) then raise exception 'PORTAL_DENIED';end if;
    update public.organization_invites set revoked_at=now() where id=(p_input->>'inviteId')::uuid;
    perform private.portal_audit('invitation.revoked','invitation',(p_input->>'inviteId')::uuid,org);return '{}';
  elsif p_action='register_document' then
    if not(private.portal_member(org) or private.portal_admin()) then raise exception 'PORTAL_DENIED';end if;
    target:=(p_input->>'documentId')::uuid;
    if p_input->>'storagePath'<>org::text||'/'||target::text or not exists(select 1 from storage.objects where bucket_id='provider-documents' and name=p_input->>'storagePath') then raise exception 'PORTAL_FILE_REQUIRED';end if;
    insert into public.provider_documents(id,organization_id,record_id,name,document_type,storage_path,mime_type,size_bytes,expires_on,uploaded_by)
      values(target,org,rid,p_input->>'name',p_input->>'documentType',p_input->>'storagePath',p_input->>'mimeType',(p_input->>'sizeBytes')::integer,nullif(p_input->>'expiresOn','')::date,uid) returning to_jsonb(provider_documents.*) into result;
    perform private.portal_audit('document.uploaded','document',target,org,null,result);perform private.portal_notify_staff('Provider evidence uploaded',p_input->>'name','document',target);return result;
  elsif p_action='review_document' then
    select * into d from public.provider_documents where id=(p_input->>'documentId')::uuid for update;
    if not found then raise exception 'PORTAL_NOT_FOUND';end if;
    if not(private.portal_admin() or private.portal_org_reviewer(d.organization_id)) then raise exception 'PORTAL_DENIED';end if;
    new_status:=p_input->>'status';if new_status not in ('under_review','approved','rejected','expired','archived') or (new_status in ('rejected','archived') and length(trim(msg))<5) then raise exception 'PORTAL_REVIEW_REASON_REQUIRED';end if;
    if new_status='approved' and d.expires_on<current_date then raise exception 'PORTAL_EVIDENCE_EXPIRED';end if;
    old_row:=to_jsonb(d);update public.provider_documents set status=new_status,review_message=msg,reviewed_by=uid,updated_at=now() where id=d.id returning * into d;
    perform private.portal_audit('document.'||new_status,'document',d.id,d.organization_id,old_row,to_jsonb(d));
    perform private.portal_notify_org(d.organization_id,'Document review updated',d.name||': '||new_status,'document',d.id);return to_jsonb(d);
  elsif p_action='organization_message' then
    if not(private.portal_member(org) or private.portal_admin()) then raise exception 'PORTAL_DENIED';end if;
    insert into public.organization_messages(organization_id,actor_id,body) values(org,uid,p_input->>'body') returning to_jsonb(organization_messages.*) into result;
    perform private.portal_audit('organization.message','organization',org,org);
    if private.portal_admin() then perform private.portal_notify_org(org,'Admin message','Open Messages to read the message.','organization',org);
    else perform private.portal_notify_staff('Provider message','Open the organization conversation.','organization',org);end if;return result;
  elsif p_action='mark_notification' then
    update public.portal_notifications set read_at=case when coalesce((p_input->>'read')::boolean,true) then now() else null end where id=(p_input->>'notificationId')::uuid and user_id=uid returning to_jsonb(portal_notifications.*) into result;
    if result is null then raise exception 'PORTAL_NOT_FOUND';end if;return result;
  elsif p_action='save_preferences' then
    insert into public.portal_accounts(user_id,notification_preferences) values(uid,jsonb_build_object('in_app',coalesce((p_input->>'inApp')::boolean,true)))
      on conflict(user_id) do update set notification_preferences=excluded.notification_preferences,updated_at=now();
    perform private.portal_audit('preferences.updated','user',uid,null);return '{}';
  elsif p_action='set_staff_role' then
    target:=(p_input->>'userId')::uuid;new_status:=p_input->>'role';
    if not private.portal_admin() or (v_role<>'super_admin' and (new_status in ('admin','super_admin') or exists(select 1 from public.staff_roles where user_id=target and role in ('admin','super_admin')))) then raise exception 'PORTAL_DENIED';end if;
    lock table public.staff_roles in share row exclusive mode;
    if (new_status<>'super_admin' or not (p_input->>'active')::boolean) and exists(select 1 from public.staff_roles where user_id=target and role='super_admin' and active)
      and (select count(*) from public.staff_roles where role='super_admin' and active)<=1 then raise exception 'PORTAL_LAST_ADMIN';end if;
    select to_jsonb(sr) into old_row from public.staff_roles sr where user_id=target;
    insert into public.staff_roles(user_id,role,active,granted_by) values(target,new_status,(p_input->>'active')::boolean,uid)
      on conflict(user_id) do update set role=excluded.role,active=excluded.active,granted_by=uid,updated_at=now() returning to_jsonb(staff_roles.*) into result;
    perform private.portal_audit('staff.role_changed','user',target,null,old_row,result);return result;
  elsif p_action='set_account_status' then
    if not private.portal_admin() then raise exception 'PORTAL_DENIED';end if;target:=(p_input->>'userId')::uuid;
    if target=uid or (v_role<>'super_admin' and exists(select 1 from public.staff_roles where user_id=target and role in ('admin','super_admin'))) then raise exception 'PORTAL_DENIED';end if;
    if exists(select 1 from public.staff_roles where user_id=target and role='super_admin' and active) and not (p_input->>'active')::boolean then raise exception 'PORTAL_LAST_ADMIN';end if;
    select to_jsonb(a) into old_row from public.portal_accounts a where user_id=target;
    insert into public.portal_accounts(user_id,active) values(target,(p_input->>'active')::boolean) on conflict(user_id) do update set active=excluded.active,updated_at=now() returning to_jsonb(portal_accounts.*) into result;
    perform private.portal_audit('account.status_changed','user',target,null,old_row,result);return result;
  elsif p_action='organization_status' then
    if not private.portal_admin() then raise exception 'PORTAL_DENIED';end if;
    select * into o from public.organizations where id=org for update;if not found then raise exception 'PORTAL_NOT_FOUND';end if;
    old_row:=to_jsonb(o);update public.organizations set status=p_input->>'status',updated_at=now() where id=org returning * into o;
    perform private.portal_audit('organization.status_changed','organization',org,org,old_row,to_jsonb(o));return to_jsonb(o);
  elsif p_action='save_setting' then
    if v_role is distinct from 'super_admin' then raise exception 'PORTAL_DENIED';end if;
    if p_input->>'key'='provider_required_fields' and (jsonb_typeof(p_input->'value')<>'array' or not p_input->'value' @> '["name","description","cityId"]'::jsonb) then raise exception 'PORTAL_INVALID';end if;
    if p_input->>'key'='publication_requires_identity_evidence' and p_input->'value'<>'true'::jsonb then raise exception 'PORTAL_INVALID';end if;
    select to_jsonb(ps) into old_row from public.portal_settings ps where key=p_input->>'key';
    update public.portal_settings set value=p_input->'value',updated_by=uid,updated_at=now() where key=p_input->>'key' returning to_jsonb(portal_settings.*) into result;
    if result is null then raise exception 'PORTAL_NOT_FOUND';end if;perform private.portal_audit('settings.updated','setting',null,null,old_row,result);return result;
  end if;
  raise exception 'PORTAL_ACTION_INVALID';
end;$$;

create function public.bootstrap_portal_super_admin(p_email text) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;begin
  lock table public.staff_roles in share row exclusive mode;
  if exists(select 1 from public.staff_roles where role='super_admin') then raise exception 'PORTAL_ALREADY_BOOTSTRAPPED';end if;
  select id into target from auth.users where lower(email)=lower(trim(p_email));if target is null then raise exception 'PORTAL_USER_NOT_FOUND';end if;
  insert into public.staff_roles(user_id,role) values(target,'super_admin');
  insert into public.audit_events(actor_id,actor_type,actor_role,event_name,entity_type,entity_id,metadata)
    values(target,'system','super_admin','staff.bootstrap','user',target,'{"source":"explicit operator bootstrap"}');return target;
end;$$;
revoke all on function private.portal_reviewer(uuid),private.portal_org_reviewer(uuid),private.portal_validate_record(text,jsonb,boolean) from public;
grant execute on function private.portal_reviewer(uuid),private.portal_org_reviewer(uuid) to authenticated;
revoke all on function public.portal_command(text,jsonb) from public,anon;
grant execute on function public.portal_command(text,jsonb) to authenticated;
revoke all on function public.bootstrap_portal_super_admin(text) from public,anon,authenticated;
grant execute on function public.bootstrap_portal_super_admin(text) to service_role;
