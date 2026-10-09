-- Having an organization membership must not widen a Support agent's assignment scope.
-- A user with both roles may use their authorized provider view, without internal notes.
create or replace function private.portal_case_staff(p_case uuid) returns boolean language sql stable security definer set search_path='' as $$
  select private.portal_active() and exists(select 1 from public.support_cases c where c.id=p_case and c.consent_revoked_at is null and
    (private.portal_manager() or (private.portal_role()='support_agent' and (c.assigned_to=auth.uid() or c.assigned_to is null))));
$$;

-- Preserve the legacy context while keeping new inquiries on their minimal,
-- consent-scoped projection even for direct authenticated RPC callers.
alter function public.portal_case_context(uuid) rename to portal_legacy_case_context;
revoke all on function public.portal_legacy_case_context(uuid) from public,anon,authenticated;
create function public.portal_case_context(p_case_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.support_cases where id=p_case_id and inquiry_source<>'legacy') then
    return public.inquiry_context(p_case_id);
  end if;
  return public.portal_legacy_case_context(p_case_id);
end;$$;
revoke all on function public.portal_case_context(uuid) from public,anon;
grant execute on function public.portal_case_context(uuid) to authenticated;

-- Record field-level lifecycle and permission changes without patient prose,
-- filenames, file bytes, purpose text or conversation contents in audit logs.
create function private.inquiry_row_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare cid uuid;before_value jsonb;after_value jsonb;row_value jsonb:=to_jsonb(new);owner_id uuid;org_id uuid;actor_role text;begin
  if tg_table_name='support_cases' then
    if new.inquiry_source='legacy' then return new;end if;
    cid:=new.id;
    after_value:=jsonb_build_object('status',new.status,'assignedTo',new.assigned_to,'priority',new.priority,'dueAt',new.due_at,'providerStatus',new.provider_response_status,'providerAuthorized',new.share_with_provider,'supportRevokedAt',new.consent_revoked_at);
    if tg_op='UPDATE' then before_value:=jsonb_build_object('status',old.status,'assignedTo',old.assigned_to,'priority',old.priority,'dueAt',old.due_at,'providerStatus',old.provider_response_status,'providerAuthorized',old.share_with_provider,'supportRevokedAt',old.consent_revoked_at);end if;
    if before_value is not distinct from after_value then return new;end if;
  else
    cid:=(row_value->>'case_id')::uuid;
    after_value:=jsonb_build_object('rowId',row_value->'id','documentId',row_value->'document_id','requestId',row_value->'request_id','replacesId',row_value->'replaces_id','recipient',row_value->'recipient','organizationId',row_value->'organization_id','status',row_value->'status','revokedAt',row_value->'revoked_at');
    if tg_op='UPDATE' then row_value:=to_jsonb(old);before_value:=jsonb_build_object('rowId',row_value->'id','documentId',row_value->'document_id','requestId',row_value->'request_id','replacesId',row_value->'replaces_id','recipient',row_value->'recipient','organizationId',row_value->'organization_id','status',row_value->'status','revokedAt',row_value->'revoked_at');end if;
    if before_value is not distinct from after_value then return new;end if;
  end if;
  select patient_id,organization_id into owner_id,org_id from public.support_cases where id=cid;
  actor_role:=case when auth.uid()=owner_id then 'patient' when private.portal_case_staff(cid) then private.portal_role() else (select role from public.organization_members where user_id=auth.uid() and organization_id=org_id and active) end;
  insert into public.audit_events(actor_id,actor_type,actor_role,event_name,entity_type,entity_id,old_value,new_value)
    values(auth.uid(),case when auth.uid() is null then 'system' when auth.uid()=owner_id then 'patient' else 'staff' end,coalesce(actor_role,'system'),'inquiry.'||tg_table_name||'.'||lower(tg_op),'support_case',cid,before_value,after_value);
  return new;
end;$$;
revoke all on function private.inquiry_row_audit() from public,anon,authenticated;
do $$declare t text;begin foreach t in array array['support_cases','support_case_documents','support_document_grants','support_case_provider_consents','support_document_requests'] loop
  execute format('create trigger inquiry_scope_audit after insert or update on public.%I for each row execute function private.inquiry_row_audit()',t);
end loop;end;$$;

-- An audit reader cannot use a private-upload event as a metadata side channel.
create policy inquiry_private_document_audit on public.audit_events as restrictive for select to authenticated
  using(event_name not in ('inquiry.support_case_documents.insert','inquiry.support_case_documents.update')
    or private.inquiry_document_access((new_value->>'rowId')::uuid));

create or replace function private.inquiry_emit(p_case uuid,p_action text,p_summary text,p_visibility text) returns uuid language plpgsql security definer set search_path='' as $$
declare eid uuid;owner_id uuid;org_id uuid;actor_role text;begin
  select patient_id,organization_id into owner_id,org_id from public.support_cases where id=p_case;
  actor_role:=case when auth.uid()=owner_id then 'patient' when private.portal_case_staff(p_case) then private.portal_role() else (select role from public.organization_members where user_id=auth.uid() and organization_id=org_id and active) end;
  insert into public.support_case_events(case_id,actor_id,action,summary,visibility) values(p_case,auth.uid(),p_action,p_summary,p_visibility) returning id into eid;
  insert into public.audit_events(actor_id,actor_type,actor_role,event_name,entity_type,entity_id)
    values(auth.uid(),case when auth.uid()=owner_id then 'patient' when auth.uid() is null then 'system' else 'staff' end,coalesce(actor_role,'system'),p_action,'support_case',p_case);
  perform private.support_notify(p_case,p_summary,p_visibility);
  return eid;
end;$$;
