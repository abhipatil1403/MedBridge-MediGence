-- Only disposable QA. No production incidents/notifications or document objects.
\set ON_ERROR_STOP on
begin;
do $$begin if current_database() not like 'production_catalog_%' then raise exception 'Disposable QA database required';end if;end;$$;
create function pg_temp.m_assert(ok boolean,msg text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',msg;end if;raise notice 'PASS: %',msg;end;$$;
create temporary table monitor_users(k text,id uuid default gen_random_uuid());
insert into monitor_users(k) values('admin'),('patient');
insert into auth.users(id,email) select id,'monitor-'||k||'@qa.invalid' from monitor_users;
insert into public.staff_roles(user_id,role) select id,'super_admin' from monitor_users where k='admin';
grant select on monitor_users to authenticated;
select pg_temp.m_assert(not has_function_privilege('anon','public.operations_monitor_probe()','EXECUTE') and not has_function_privilege('authenticated','public.operations_monitor_probe()','EXECUTE'),'ordinary sessions cannot invoke the aggregate probe');
select pg_temp.m_assert(has_function_privilege('service_role','public.operations_monitor_probe()','EXECUTE'),'dedicated server may read the aggregate');
insert into public.agent_runs(agent_name,agent_version,purpose,status,created_at) values('qa','1','private prose','awaiting_user_input',now()-interval '10 minutes'),('qa','1','private prose','awaiting_approval',now()-interval '10 minutes');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from monitor_users where k='admin'),true);
select pg_temp.m_assert(public.operations_overview()->'ai'->>'stalled'='0','awaiting patient input and approval are not stalled');
reset role;
-- Reproduce the prior defect against the preserved original implementation.
select set_config('request.jwt.claim.sub',(select id::text from monitor_users where k='admin'),true);
select pg_temp.m_assert(private.operations_overview_before_monitor()->'ai'->>'stalled'='2','original overview reproducibly misclassified waiting states');
insert into public.agent_runs(agent_name,agent_version,purpose,status,created_at) values('qa','1','private prose','running',now()-interval '10 minutes'),('qa','1','private prose','queued',now()-interval '10 minutes');
select pg_temp.m_assert(public.operations_monitor_probe()->>'stalledWorkflows'='2','only active stale executions are counted');
select pg_temp.m_assert(public.operations_monitor_probe()::text not like '%private prose%' and not (public.operations_monitor_probe() ?| array['id','path','checksum','token','patient','owner']),'aggregate excludes identifiers and sensitive context');
insert into public.operational_incidents(category,severity,created_by,owner_id) select 'application','medium',id,id from monitor_users where k='admin';
select pg_temp.m_assert(public.operations_monitor_probe()->>'unownedIncidents'='0','active admin ownership is recognized');
update public.staff_roles set active=false where user_id=(select id from monitor_users where k='admin');
select pg_temp.m_assert(public.operations_monitor_probe()->>'unownedIncidents'='1','deactivated incident owner requires escalation');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from monitor_users where k='patient'),true);
select pg_temp.m_assert((select count(*)=0 from public.operational_incidents),'patient cannot read an incident');
do $$begin
 begin perform public.operations_overview();raise exception 'FAIL: patient overview permitted';exception when raise_exception then if sqlerrm<>'PORTAL_DENIED' then raise;end if;end;
 begin perform public.operations_monitor_probe();raise exception 'FAIL: patient monitor permitted';exception when insufficient_privilege then null;end;
end;$$;
reset role;
rollback;
