-- Server read models retain the same tenant/case boundaries as the command layer.
create function public.portal_team(p_organization_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not(private.portal_admin() or private.portal_member(p_organization_id)) then raise exception 'PORTAL_DENIED';end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'name',p.display_name,'email',u.email,'role',m.role,'active',m.active,'last_active_at',m.last_active_at)) from public.organization_members m join auth.users u on u.id=m.user_id left join public.profiles p on p.id=m.user_id where m.organization_id=p_organization_id),'[]');
end;$$;
create function public.portal_staff_directory() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if private.portal_role() is null then raise exception 'PORTAL_DENIED';end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',s.user_id,'name',coalesce(p.display_name,u.email),'role',s.role)) from public.staff_roles s join auth.users u on u.id=s.user_id left join public.profiles p on p.id=s.user_id where s.active and not exists(select 1 from public.portal_accounts a where a.user_id=s.user_id and not a.active)),'[]');
end;$$;
create function public.record_portal_verification(p_actor uuid,p_organization_id uuid,p_provider_id uuid,p_report jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;begin
  if not exists(select 1 from public.staff_roles where user_id=p_actor and active and role in ('admin','super_admin'))
    and not exists(select 1 from public.provider_submissions where organization_id=p_organization_id and reviewer_id=p_actor) then raise exception 'PORTAL_DENIED';end if;
  if exists(select 1 from public.portal_accounts where user_id=p_actor and not active) or not exists(select 1 from public.organizations where id=p_organization_id and hospital_id=p_provider_id) then raise exception 'PORTAL_DENIED';end if;
  insert into public.portal_verification_checks(organization_id,initiated_by,provider_id,report) values(p_organization_id,p_actor,p_provider_id,p_report) returning id into result;
  insert into public.audit_events(actor_id,actor_type,actor_role,event_name,entity_type,entity_id,organization_id)
    values(p_actor,'staff',(select role from public.staff_roles where user_id=p_actor),'verification.checked','verification',result,p_organization_id);
  perform private.portal_notify_org(p_organization_id,'Provider Verification updated','Open Verification to review factual evidence and unresolved fields.','verification',result);
  return result;
end;$$;
-- Administrators need draft catalog reads for governance; the anonymous catalog policy is unchanged.
do $$declare t text;begin foreach t in array array['hospitals','doctors','packages','treatments','specialties','countries','cities','healthcare_services'] loop
  execute format('create policy portal_catalog_admin on public.%I for select to authenticated using(private.portal_admin())',t);
end loop;end;$$;
-- Account suspension also applies to existing patient workspaces without granting staff access.
do $$declare t text;begin foreach t in array array['profiles','cases','case_members','consents','case_documents','conversations','conversation_messages','care_plans','care_plan_tasks','document_workspaces','provider_verification_runs','agent_runs','agent_tasks','agent_actions','agent_outputs','agent_approvals'] loop
  execute format('create policy portal_account_restriction on public.%I as restrictive for all to authenticated using(private.portal_active()) with check(private.portal_active())',t);
end loop;end;$$;
revoke all on function public.portal_team(uuid),public.portal_staff_directory() from public,anon;
grant execute on function public.portal_team(uuid),public.portal_staff_directory() to authenticated;
revoke all on function public.record_portal_verification(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_portal_verification(uuid,uuid,uuid,jsonb) to service_role;
