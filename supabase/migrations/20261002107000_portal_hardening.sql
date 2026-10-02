-- Preserve applied migrations; harden confirmation and serialize privilege changes.
create function public.portal_touch_activity() returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.portal_active() then raise exception 'PORTAL_DENIED';end if;
  update public.organization_members set last_active_at=now() where user_id=auth.uid() and active;
end;$$;
revoke all on function public.portal_touch_activity() from public,anon;
grant execute on function public.portal_touch_activity() to authenticated;
create function private.sync_published_organization() returns trigger language plpgsql set search_path='' as $$
declare snapshot jsonb;begin
  if new.kind='organization' and new.published_revision is not null and new.published_revision is distinct from old.published_revision then
    select data into snapshot from public.provider_revisions where record_id=new.id and revision=new.published_revision;
    update public.organizations set provider_type=coalesce(snapshot->>'providerType',provider_type) where id=new.organization_id;
  end if;return new;
end;$$;
revoke all on function private.sync_published_organization() from public;
create trigger synchronize_published_organization after update on public.provider_records for each row execute function private.sync_published_organization();
create or replace function public.portal_command(p_action text,p_input jsonb default '{}') returns jsonb
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
    lock table public.staff_roles in share row exclusive mode;
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
    if not private.portal_admin() then raise exception 'PORTAL_DENIED';end if;lock table public.staff_roles in share row exclusive mode;target:=(p_input->>'userId')::uuid;
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
    if p_input->>'key'='provider_required_fields' and exists(select 1 from jsonb_array_elements_text(p_input->'value') f where f not in ('name','description','cityId','email','phone','address','website','legalName','contactName','postalCode','state')) then raise exception 'PORTAL_INVALID';end if;
    if p_input->>'key'='publication_requires_identity_evidence' and p_input->'value'<>'true'::jsonb then raise exception 'PORTAL_INVALID';end if;
    select to_jsonb(ps) into old_row from public.portal_settings ps where key=p_input->>'key';
    update public.portal_settings set value=p_input->'value',updated_by=uid,updated_at=now() where key=p_input->>'key' returning to_jsonb(portal_settings.*) into result;
    if result is null then raise exception 'PORTAL_NOT_FOUND';end if;perform private.portal_audit('settings.updated','setting',null,null,old_row,result);return result;
  end if;
  raise exception 'PORTAL_ACTION_INVALID';
end;$$;

create or replace function public.portal_publication_command(p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.provider_submissions;r public.provider_records;o public.organizations;i record;old_row jsonb;new_status text;
begin
  if not private.portal_active() then raise exception 'PORTAL_DENIED';end if;
  if p_action='publish_submission' then
    if not private.portal_admin() then raise exception 'PORTAL_DENIED';end if;
    select * into s from public.provider_submissions where id=(p_input->>'submissionId')::uuid for update;
    if not found or s.status<>'approved' then raise exception 'PORTAL_TRANSITION_INVALID';end if;
    select * into o from public.organizations where id=s.organization_id for update;
    for i in select item.*,pr.kind from public.provider_submission_items item join public.provider_records pr on pr.id=item.record_id where item.submission_id=s.id order by case pr.kind when 'organization' then 0 when 'doctor' then 2 when 'package' then 3 else 1 end loop
      if o.source_kind<>'synthetic' and i.kind in ('organization','accreditation') then
        if not exists(select 1 from public.provider_field_reviews f where f.record_id=i.record_id and f.revision=i.revision and f.field=case when i.kind='organization' then 'name' else 'body' end and f.status='verified' and (f.expires_on is null or f.expires_on>=current_date)
          and not exists(select 1 from public.provider_field_reviews later where later.record_id=f.record_id and later.revision=f.revision and later.field=f.field and later.sequence>f.sequence)
          and (f.document_id is null or exists(select 1 from public.provider_documents d where d.id=f.document_id and d.status='approved' and (d.expires_on is null or d.expires_on>=current_date)))) then raise exception 'PORTAL_EVIDENCE_REQUIRED';end if;
      end if;
      if exists(select 1 from public.provider_field_reviews f where f.record_id=i.record_id and f.revision=i.revision and f.status in ('conflicting','rejected','stale') and not exists(select 1 from public.provider_field_reviews later where later.record_id=f.record_id and later.revision=f.revision and later.field=f.field and later.sequence>f.sequence)) then raise exception 'PORTAL_REVIEW_UNRESOLVED';end if;
      perform private.portal_project_record(i.record_id,i.revision);
    end loop;
    perform private.portal_refresh_hospital(o.id);
    update public.provider_submissions set status='published',updated_at=now() where id=s.id returning * into s;
    perform private.portal_audit('submission.published','submission',s.id,o.id,null,to_jsonb(s));
    perform private.portal_notify_org(o.id,'Your information is published','Approved snapshots are now available in public discovery.','submission',s.id);return to_jsonb(s);
  elsif p_action in ('archive_record','unpublish_record','expire_record') then
    select * into r from public.provider_records where id=(p_input->>'recordId')::uuid for update;
    if not found then raise exception 'PORTAL_NOT_FOUND';end if;
    if not private.portal_admin() and not(private.portal_member(r.organization_id) and r.published_revision is null and p_action='archive_record') then raise exception 'PORTAL_DENIED';end if;
    if r.revision<>coalesce((p_input->>'expectedRevision')::integer,-1) then raise exception 'PORTAL_CONFLICT';end if;
    if p_input->>'confirmed' is distinct from 'true' then raise exception 'PORTAL_CONFIRM_REQUIRED';end if;
    old_row:=to_jsonb(r);new_status:=case p_action when 'archive_record' then 'archived' when 'expire_record' then 'expired' else 'approved' end;
    if r.kind='organization' then update public.hospitals set publication_status='draft' where id=r.canonical_id;
    elsif r.kind='doctor' then update public.doctors set publication_status='draft' where id=r.canonical_id;
    elsif r.kind='package' then update public.packages set publication_status='draft',status=case when new_status='expired' then 'expired' when new_status='archived' then 'archived' else 'paused' end where id=r.canonical_id;
    elsif r.kind='specialty' then delete from public.hospital_specialties where hospital_id=(select hospital_id from public.organizations where id=r.organization_id) and specialty_id=r.canonical_id;
    elsif r.kind='treatment' then delete from public.hospital_treatments where hospital_id=(select hospital_id from public.organizations where id=r.organization_id) and treatment_id=r.canonical_id;
    end if;
    update public.provider_records set published_revision=null,status=new_status,updated_at=now() where id=r.id returning * into r;
    perform private.portal_refresh_hospital(r.organization_id);perform private.portal_audit('record.'||new_status,r.kind,r.id,r.organization_id,old_row,to_jsonb(r));
    perform private.portal_notify_org(r.organization_id,'Publication changed',r.name||': '||new_status,'record',r.id);return to_jsonb(r);
  end if;raise exception 'PORTAL_ACTION_INVALID';
end;$$;
create or replace function public.portal_catalog_command(p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.catalog_drafts;old_row jsonb;payload jsonb;current_row jsonb;result jsonb;target uuid;allowed text[];k text;
begin
  if not private.portal_admin() then raise exception 'PORTAL_DENIED';end if;
  if p_action='create_source' then
    if p_input->>'sourceKind' not in ('synthetic','external','first_party') or length(coalesce(p_input->>'name',''))<3 then raise exception 'PORTAL_INVALID';end if;
    if p_input->>'sourceKind'<>'synthetic' and coalesce(p_input->>'url','') !~ '^https://[^[:space:]]+$' then raise exception 'PORTAL_EVIDENCE_REQUIRED';end if;
    insert into public.source_records(source_kind,source_name,source_url,retrieved_at,notes) values(p_input->>'sourceKind',p_input->>'name',nullif(p_input->>'url',''),now(),coalesce(p_input->>'notes','')) returning to_jsonb(source_records.*) into result;
    perform private.portal_audit('source.recorded','source',(result->>'id')::uuid,null,null,result);return result;
  elsif p_action='save_catalog_draft' then
    if p_input->>'entity' not in ('treatments','specialties','countries','cities','healthcare_services','hospitals','doctors','packages') then raise exception 'PORTAL_INVALID';end if;
    target:=nullif(p_input->>'targetId','')::uuid;
    if target is not null then execute format('select to_jsonb(x) from public.%I x where id=$1',p_input->>'entity') into current_row using target;if current_row is null then raise exception 'PORTAL_NOT_FOUND';end if;end if;
    if nullif(p_input->>'draftId','') is null then
      insert into public.catalog_drafts(entity,target_id,name,data,expected_updated_at,created_by) values(p_input->>'entity',target,p_input->>'name',p_input->'data',(current_row->>'updated_at')::timestamptz,auth.uid()) returning * into d;
    else
      select * into d from public.catalog_drafts where id=(p_input->>'draftId')::uuid for update;
      if not found or d.entity<>p_input->>'entity' or d.status in ('published','archived') then raise exception 'PORTAL_TRANSITION_INVALID';end if;
      if d.revision<>coalesce((p_input->>'expectedRevision')::integer,-1) then raise exception 'PORTAL_CONFLICT';end if;
      old_row:=to_jsonb(d);update public.catalog_drafts set name=p_input->>'name',data=p_input->'data',revision=revision+1,status='draft',approved_by=null,updated_at=now() where id=d.id returning * into d;
    end if;
    perform private.portal_audit('catalog.draft_saved',d.entity,d.id,null,old_row,to_jsonb(d));return to_jsonb(d);
  elsif p_action in ('approve_catalog','archive_catalog_draft','publish_catalog') then
    select * into d from public.catalog_drafts where id=(p_input->>'draftId')::uuid for update;
    if not found then raise exception 'PORTAL_NOT_FOUND';end if;
    if d.revision<>coalesce((p_input->>'expectedRevision')::integer,-1) then raise exception 'PORTAL_CONFLICT';end if;
    old_row:=to_jsonb(d);
    if p_action='approve_catalog' then
      if d.status<>'draft' then raise exception 'PORTAL_TRANSITION_INVALID';end if;
      update public.catalog_drafts set status='approved',approved_by=auth.uid(),updated_at=now() where id=d.id returning * into d;
    elsif p_action='archive_catalog_draft' then
      if p_input->>'confirmed' is distinct from 'true' then raise exception 'PORTAL_CONFIRM_REQUIRED';end if;
      update public.catalog_drafts set status='archived',updated_at=now() where id=d.id returning * into d;
    else
      if d.status<>'approved' or p_input->>'confirmed' is distinct from 'true' then raise exception 'PORTAL_TRANSITION_INVALID';end if;
      target:=coalesce(d.target_id,gen_random_uuid());
      if d.target_id is not null then
        execute format('select to_jsonb(x) from public.%I x where id=$1 for update',d.entity) into current_row using d.target_id;
        if current_row is null or (current_row->>'updated_at')::timestamptz is distinct from d.expected_updated_at then raise exception 'PORTAL_CONFLICT';end if;
      else
        if d.entity in ('hospitals','doctors','packages') then raise exception 'PORTAL_USE_PROVIDER_WORKFLOW';end if;
        current_row:=jsonb_build_object('id',target,'aliases','[]'::jsonb,'created_at',now(),'updated_at',now(),'source_kind','synthetic','publication_status','draft','faqs','[]'::jsonb,'steps','[]'::jsonb,'description','','travel_note','','status','draft');
      end if;
      allowed:=case d.entity
        when 'treatments' then array['slug','name','specialty_id','category','description','overview','procedure_summary','indications','diagnostics','recovery','typical_stay_days','faqs','aliases','source_kind','source_record_id']
        when 'specialties' then array['slug','name','aliases','source_kind','source_record_id']
        when 'countries' then array['slug','name','iso_code','description','aliases','travel_note','source_kind','source_record_id']
        when 'cities' then array['slug','name','country_id','aliases']
        when 'healthcare_services' then array['slug','name','description','aliases','href','category','steps','source_kind','source_record_id']
        when 'hospitals' then array['name','description','city_id','aliases','bed_count','infrastructure','accreditation_note','source_record_id']
        when 'doctors' then array['name','description','home_city_id','experience_years','languages','consultation_mode','qualifications_note','aliases','source_record_id']
        else array['name','description','duration_days','currency','estimated_min','estimated_max','valid_from','valid_until','benefits','source_record_id'] end;
      payload:=current_row;
      for k in select jsonb_object_keys(d.data) loop if not k=any(allowed) then raise exception 'PORTAL_INVALID_FIELD';end if;payload:=jsonb_set(payload,array[k],d.data->k);end loop;
      payload:=payload||jsonb_build_object('name',d.name,'updated_at',now());
      if d.entity in ('hospitals','doctors','packages') and exists(select 1 from public.provider_records where canonical_id=target) then raise exception 'PORTAL_USE_PROVIDER_WORKFLOW';end if;
      if d.entity='healthcare_services' then
        if coalesce(payload->>'href','') !~ '^/[a-zA-Z0-9/_-]+$' then raise exception 'PORTAL_INVALID';end if;
        payload:=payload||'{"status":"published"}'::jsonb;
      elsif d.entity='packages' then payload:=payload||'{"publication_status":"published","status":"active"}'::jsonb;
      else payload:=payload||'{"publication_status":"published"}'::jsonb;end if;
      execute format('insert into public.%1$I select (jsonb_populate_record(null::public.%1$I,$1)).* on conflict(id) do update set (%2$s)=(select %2$s from jsonb_populate_record(null::public.%1$I,$1))',d.entity,
        (select string_agg(quote_ident(column_name),',') from information_schema.columns where table_schema='public' and table_name=d.entity and column_name<>'id')) using payload;
      update public.catalog_drafts set target_id=target,status='published',updated_at=now() where id=d.id returning * into d;
      perform private.portal_audit('catalog.published',d.entity,target,null,current_row,payload);
    end if;
    perform private.portal_audit('catalog.'||d.status,d.entity,d.id,null,old_row,to_jsonb(d));return to_jsonb(d);
  elsif p_action='unpublish_catalog' then
    if p_input->>'entity' not in ('treatments','specialties','countries','cities','healthcare_services','hospitals','doctors','packages') or p_input->>'confirmed' is distinct from 'true' then raise exception 'PORTAL_INVALID';end if;
    target:=(p_input->>'targetId')::uuid;
    if exists(select 1 from public.provider_records where canonical_id=target and kind in ('organization','doctor','package')) then raise exception 'PORTAL_USE_PROVIDER_WORKFLOW';end if;
    if (p_input->>'entity'='treatments' and (exists(select 1 from public.hospital_treatments where treatment_id=target) or exists(select 1 from public.packages where treatment_id=target and status='active')))
      or (p_input->>'entity'='specialties' and (exists(select 1 from public.treatments where specialty_id=target and publication_status='published') or exists(select 1 from public.hospital_specialties where specialty_id=target) or exists(select 1 from public.doctor_specialties where specialty_id=target)))
      or (p_input->>'entity'='cities' and (exists(select 1 from public.hospitals where city_id=target and publication_status='published') or exists(select 1 from public.doctors where home_city_id=target and publication_status='published')))
      or (p_input->>'entity'='countries' and exists(select 1 from public.cities where country_id=target and publication_status='published')) then raise exception 'PORTAL_REFERENCED_CONTENT';end if;
    execute format('select to_jsonb(x) from public.%I x where id=$1 for update',p_input->>'entity') into current_row using target;
    if current_row is null then raise exception 'PORTAL_NOT_FOUND';end if;
    if (current_row->>'updated_at')::timestamptz is distinct from (p_input->>'expectedUpdatedAt')::timestamptz then raise exception 'PORTAL_CONFLICT';end if;
    execute format('update public.%I set %I=$1,updated_at=now() where id=$2',p_input->>'entity',case when p_input->>'entity'='healthcare_services' then 'status' else 'publication_status' end) using 'draft',target;
    perform private.portal_audit('catalog.unpublished',p_input->>'entity',target,null,current_row);return '{}';
  end if;raise exception 'PORTAL_ACTION_INVALID';
end;$$;
