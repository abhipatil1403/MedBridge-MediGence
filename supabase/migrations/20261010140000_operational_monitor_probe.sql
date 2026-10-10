-- Read-only aggregate for a dedicated server-side monitor. No document/job identities.
create or replace function public.operations_monitor_probe() returns jsonb
language sql stable security definer set search_path='' set statement_timeout='3s' as $$
 select jsonb_build_object(
  'checkedAt',now(),
  'storagePrivate',(select count(*)=2 from storage.buckets where id in ('care-documents','provider-documents') and not public),
  'requestFailures',(select count(*) from public.audit_events where event_name='operations.request' and occurred_at>=now()-interval '5 minutes' and metadata->>'outcome' in ('failed','partially_completed') and metadata ? 'category'),
  'failedWorkflows',(select count(*) from public.agent_runs where status='failed' and finished_at>=now()-interval '5 minutes'),
  'stalledWorkflows',(select count(*) from public.agent_runs where status in ('queued','running') and created_at<now()-interval '5 minutes'),
  'blockedDocuments',(select count(*) from public.document_security_jobs where ready and state in ('pending_scan','scanning','scan_failed') and created_at<now()-interval '5 minutes'),
  'unownedIncidents',(select count(*) from public.operational_incidents i where status not in ('resolved','closed') and not exists(select 1 from public.staff_roles s where s.user_id=i.owner_id and s.active and s.role in ('admin','super_admin') and not exists(select 1 from public.portal_accounts a where a.user_id=s.user_id and not a.active)))
 );
$$;
revoke all on function public.operations_monitor_probe() from public,anon,authenticated;
grant execute on function public.operations_monitor_probe() to service_role;

-- Reuse the existing authorized overview. Awaiting input/approval is not a stalled run.
do $$begin
 if to_regprocedure('private.operations_overview_before_monitor()') is null then
  alter function public.operations_overview() set schema private;
  alter function private.operations_overview() rename to operations_overview_before_monitor;
 end if;
end;$$;
revoke all on function private.operations_overview_before_monitor() from public,anon,authenticated;
create or replace function public.operations_overview() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 result:=private.operations_overview_before_monitor(); -- retains active Admin authorization
 result:=jsonb_set(result,'{ai,stalled}',to_jsonb((select count(*) from public.agent_runs where status in ('queued','running') and finished_at is null and created_at>=now()-interval '24 hours' and created_at<now()-interval '5 minutes')));
 return jsonb_set(result,'{incidents,unowned}',to_jsonb((select count(*) from public.operational_incidents i where status not in ('resolved','closed') and not exists(select 1 from public.staff_roles s where s.user_id=i.owner_id and s.active and s.role in ('admin','super_admin') and not exists(select 1 from public.portal_accounts a where a.user_id=s.user_id and not a.active)))));
end;$$;
revoke all on function public.operations_overview() from public,anon;
grant execute on function public.operations_overview() to authenticated;
