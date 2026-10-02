alter table public.support_cases add column hospital_id uuid references public.hospitals(id);
create or replace function private.portal_case_access(p_case uuid) returns boolean language sql stable security definer set search_path='' as $$
  select private.portal_active() and exists(select 1 from public.support_cases c where c.id=p_case and
    (c.patient_id=auth.uid() or (c.consent_revoked_at is null and (private.portal_manager()
      or (private.portal_role()='support_agent' and (c.assigned_to=auth.uid() or c.assigned_to is null))
      or (c.share_with_provider and private.portal_member(c.organization_id))))));
$$;
create function private.support_notify(p_case uuid,p_title text,p_visibility text) returns void language sql security definer set search_path='' as $$
  insert into public.portal_notifications(user_id,title,resource_type,resource_id)
  select distinct recipients.user_id,p_title,'support_case',p_case from public.support_cases c cross join lateral (
    select c.assigned_to user_id
    union select c.patient_id where p_visibility in ('patient','shared')
    union select m.user_id from public.organization_members m where m.organization_id=c.organization_id and m.active and c.share_with_provider and p_visibility in ('provider','shared')
    union select sr.user_id from public.staff_roles sr where sr.active and sr.role in ('support_manager','admin','super_admin') and c.status='escalated'
  ) recipients where c.id=p_case and recipients.user_id is not null and recipients.user_id<>auth.uid()
    and not exists(select 1 from public.portal_accounts a where a.user_id=recipients.user_id and (not a.active or a.notification_preferences->>'in_app'='false'));
$$;

create function public.support_command(p_action text,p_input jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); cid uuid:=nullif(p_input->>'caseId','')::uuid;target uuid;org uuid;
  c public.support_cases;t public.support_tasks;result jsonb;old_row jsonb;vis text;new_status text;message text;
begin
  if not private.portal_active() then raise exception 'PORTAL_DENIED';end if;
  if p_action='create_case' then
    if p_input->>'consent'<>'true' then raise exception 'PORTAL_CONSENT_REQUIRED';end if;
    if nullif(p_input->>'sourceCaseId','') is not null and not exists(select 1 from public.cases where id=(p_input->>'sourceCaseId')::uuid and owner_id=uid) then raise exception 'PORTAL_DENIED';end if;
    if nullif(p_input->>'conversationId','') is not null and not exists(select 1 from public.conversations where id=(p_input->>'conversationId')::uuid and owner_id=uid) then raise exception 'PORTAL_DENIED';end if;
    if nullif(p_input->>'documentWorkspaceId','') is not null and not exists(select 1 from public.document_workspaces where id=(p_input->>'documentWorkspaceId')::uuid and owner_id=uid) then raise exception 'PORTAL_DENIED';end if;
    if nullif(p_input->>'hospitalId','') is not null then
      if not exists(select 1 from public.hospitals where id=(p_input->>'hospitalId')::uuid and publication_status='published') then raise exception 'PORTAL_NOT_FOUND';end if;
      select id into org from public.organizations where hospital_id=(p_input->>'hospitalId')::uuid and status='active';
    end if;
    insert into public.support_cases(patient_id,organization_id,hospital_id,source_case_id,conversation_id,document_workspace_id,title,description,case_type,share_conversation,share_documents,share_with_provider,consent_granted_at)
      values(uid,org,nullif(p_input->>'hospitalId','')::uuid,nullif(p_input->>'sourceCaseId','')::uuid,nullif(p_input->>'conversationId','')::uuid,nullif(p_input->>'documentWorkspaceId','')::uuid,p_input->>'title',coalesce(p_input->>'description',''),coalesce(p_input->>'caseType','coordination'),coalesce((p_input->>'shareConversation')::boolean,false),coalesce((p_input->>'shareDocuments')::boolean,false),coalesce((p_input->>'shareWithProvider')::boolean,false),now()) returning * into c;
    insert into public.consents(subject_id,case_id,consent_type,purpose,decision,granted_at,version,source,metadata)
      values(uid,c.source_case_id,'platform_support','Authorized support team may coordinate this request using the explicitly selected context.','granted',now(),'1','patient_support_request',jsonb_build_object('supportCaseId',c.id,'shareConversation',c.share_conversation,'shareDocuments',c.share_documents,'shareWithProvider',c.share_with_provider));
    insert into public.support_case_events(case_id,actor_id,action,summary,visibility) values(c.id,uid,'case.created','Support request created with explicit access consent.','patient');
    perform private.portal_audit('support.created','support_case',c.id,null);
    insert into public.portal_notifications(user_id,title,resource_type,resource_id) select user_id,'New authorized support request','support_case',c.id from public.staff_roles where active and role in ('support_manager','admin','super_admin');return to_jsonb(c);
  end if;
  select * into c from public.support_cases where id=cid for update;
  if not found or not private.portal_case_access(cid) then raise exception 'PORTAL_DENIED';end if;
  if p_action='revoke_consent' then
    if c.patient_id<>uid then raise exception 'PORTAL_DENIED';end if;
    update public.support_cases set consent_revoked_at=now(),revision=revision+1,updated_at=now() where id=cid returning * into c;
    insert into public.consents(subject_id,case_id,consent_type,purpose,decision,revoked_at,version,source,metadata)
      values(uid,c.source_case_id,'platform_support','Support access revoked.','revoked',now(),'1','patient_support_request',jsonb_build_object('supportCaseId',cid));
    insert into public.support_case_events(case_id,actor_id,action,summary,visibility) values(cid,uid,'consent.revoked','Support access revoked by the patient.','patient');
    perform private.portal_audit('support.consent_revoked','support_case',cid,null);return to_jsonb(c);
  elsif p_action='message' then
    if c.consent_revoked_at is not null then raise exception 'PORTAL_CONSENT_REQUIRED';end if;
    vis:=p_input->>'visibility';message:=p_input->>'body';
    if not private.portal_case_staff(cid) and not ((c.patient_id=uid and vis in ('patient','shared')) or (private.portal_member(c.organization_id) and vis in ('provider','shared'))) then raise exception 'PORTAL_DENIED';end if;
    if vis in ('provider','shared') and c.organization_id is not null and not c.share_with_provider then raise exception 'PORTAL_CONSENT_REQUIRED';end if;
    insert into public.support_case_messages(case_id,actor_id,body,visibility) values(cid,uid,message,vis) returning to_jsonb(support_case_messages.*) into result;
    insert into public.support_case_events(case_id,actor_id,action,summary,visibility) values(cid,uid,case when vis='internal' then 'note.added' else 'message.sent' end,case when vis='internal' then 'Internal note added.' else 'A message was sent.' end,vis);
    update public.support_cases set updated_at=now(),revision=revision+1 where id=cid;
    perform private.portal_audit('support.message','support_case',cid,null,null,jsonb_build_object('visibility',vis));
    perform private.support_notify(cid,case when vis='internal' then 'Internal case note' else 'Case message' end,vis);return result;
  elsif p_action='update_case' then
    if not private.portal_case_staff(cid) then raise exception 'PORTAL_DENIED';end if;
    if c.revision<>coalesce((p_input->>'expectedRevision')::integer,-1) then raise exception 'PORTAL_CONFLICT';end if;
    old_row:=to_jsonb(c);new_status:=coalesce(p_input->>'status',c.status);
    if (c.status in ('resolved','closed') and new_status not in ('resolved','closed','open')) or (new_status='open' and c.status in ('resolved','closed') and not private.portal_manager()) then raise exception 'PORTAL_TRANSITION_INVALID';end if;
    if new_status='escalated' and length(trim(coalesce(p_input->>'reason','')))<5 then raise exception 'PORTAL_REVIEW_REASON_REQUIRED';end if;
    target:=case when p_input ? 'assignedTo' then nullif(p_input->>'assignedTo','')::uuid else c.assigned_to end;
    if target is distinct from c.assigned_to then
      if not private.portal_manager() and not (c.assigned_to is null and target=uid) then raise exception 'PORTAL_DENIED';end if;
      if target is not null and not exists(select 1 from public.staff_roles where user_id=target and active and role in ('support_agent','support_manager','admin','super_admin')) then raise exception 'PORTAL_ASSIGNEE_INVALID';end if;
    end if;
    update public.support_cases set status=new_status,priority=coalesce(p_input->>'priority',priority),assigned_to=target,due_at=case when p_input ? 'dueAt' then nullif(p_input->>'dueAt','')::timestamptz else due_at end,
      escalation_reason=case when new_status='escalated' then p_input->>'reason' else escalation_reason end,revision=revision+1,updated_at=now() where id=cid returning * into c;
    insert into public.support_case_events(case_id,actor_id,action,summary,visibility) values(cid,uid,'case.updated','Case status: '||replace(new_status,'_',' ')||'.','patient');
    perform private.portal_audit('support.updated','support_case',cid,null,old_row,to_jsonb(c));perform private.support_notify(cid,'Case status updated','patient');return to_jsonb(c);
  elsif p_action='save_task' then
    if not private.portal_case_staff(cid) then raise exception 'PORTAL_DENIED';end if;
    target:=nullif(p_input->>'assignedTo','')::uuid;
    if target is not null and not exists(select 1 from public.staff_roles where user_id=target and active and (private.portal_manager() or user_id in (uid,c.assigned_to))) then raise exception 'PORTAL_ASSIGNEE_INVALID';end if;
    if nullif(p_input->>'taskId','') is null then
      insert into public.support_tasks(case_id,title,assigned_to,due_at,priority,created_by) values(cid,p_input->>'title',target,nullif(p_input->>'dueAt','')::timestamptz,coalesce(p_input->>'priority','normal'),uid) returning * into t;
    else
      select * into t from public.support_tasks where id=(p_input->>'taskId')::uuid and case_id=cid for update;
      if not found then raise exception 'PORTAL_NOT_FOUND';end if;
      if t.revision<>coalesce((p_input->>'expectedRevision')::integer,-1) then raise exception 'PORTAL_CONFLICT';end if;
      old_row:=to_jsonb(t);
      update public.support_tasks set title=coalesce(p_input->>'title',title),assigned_to=target,due_at=nullif(p_input->>'dueAt','')::timestamptz,priority=coalesce(p_input->>'priority',priority),status=coalesce(p_input->>'status',status),revision=revision+1,updated_at=now() where id=t.id returning * into t;
    end if;
    insert into public.support_case_events(case_id,actor_id,action,summary,visibility) values(cid,uid,'task.saved',t.title||': '||t.status,'internal');
    perform private.portal_audit('support.task_saved','support_case',cid,null,old_row,to_jsonb(t));
    if target is not null and target<>uid then insert into public.portal_notifications(user_id,title,resource_type,resource_id) values(target,'Support task assigned','support_case',cid);end if;return to_jsonb(t);
  end if;
  raise exception 'PORTAL_ACTION_INVALID';
end;$$;

create function public.portal_case_context(p_case_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.support_cases;result jsonb;begin
  select * into c from public.support_cases where id=p_case_id;
  if not found or not private.portal_case_access(p_case_id) then raise exception 'PORTAL_DENIED';end if;
  result:=jsonb_build_object('case',to_jsonb(c),'patient',jsonb_build_object('id',c.patient_id,'displayName',(select display_name from public.profiles where id=c.patient_id),'email',(select email from auth.users where id=c.patient_id)),
    'messages',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at) from public.support_case_messages m where m.case_id=c.id and private.portal_case_visibility(c.id,m.visibility)),'[]'::jsonb),
    'timeline',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.support_case_events e where e.case_id=c.id and private.portal_case_visibility(c.id,e.visibility)),'[]'::jsonb),
    'tasks',case when private.portal_case_staff(c.id) then coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.support_tasks t where t.case_id=c.id),'[]'::jsonb) else '[]'::jsonb end);
  if c.consent_revoked_at is null and c.share_conversation and c.conversation_id is not null then
    result:=result||jsonb_build_object('conversation',coalesce((select jsonb_agg(jsonb_build_object('role',m.role,'content',m.content,'createdAt',m.created_at,'response',m.metadata->'response') order by m.created_at) from public.conversation_messages m where m.conversation_id=c.conversation_id),'[]'::jsonb),
      'plan',(select to_jsonb(cp)||jsonb_build_object('tasks',coalesce((select jsonb_agg(to_jsonb(t)) from public.care_plan_tasks t where t.care_plan_id=cp.id),'[]'::jsonb)) from public.care_plans cp where cp.conversation_id=c.conversation_id));
  end if;
  if c.consent_revoked_at is null and c.share_documents and c.document_workspace_id is not null then
    result:=result||jsonb_build_object('documents',(select data from public.document_workspaces where id=c.document_workspace_id));
  end if;
  return result;
end;$$;

create function public.portal_users(p_search text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not(private.portal_admin() or private.portal_manager() or private.portal_role()='support_agent') then raise exception 'PORTAL_DENIED';end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'email',u.email,'role',sr.role,'active',coalesce(a.active,true))) from public.profiles p join auth.users u on u.id=p.id left join public.staff_roles sr on sr.user_id=p.id left join public.portal_accounts a on a.user_id=p.id
    where (private.portal_admin() or (private.portal_manager() and sr.role in ('support_agent','support_manager')) or exists(select 1 from public.support_cases c where c.patient_id=p.id and private.portal_case_staff(c.id)))
    and (p_search='' or p.display_name ilike '%'||p_search||'%' or u.email ilike '%'||p_search||'%')),'[]'::jsonb);
end;$$;
revoke all on function private.support_notify(uuid,text,text) from public;
revoke all on function public.support_command(text,jsonb),public.portal_case_context(uuid),public.portal_users(text) from public,anon;
grant execute on function public.support_command(text,jsonb),public.portal_case_context(uuid),public.portal_users(text) to authenticated;
