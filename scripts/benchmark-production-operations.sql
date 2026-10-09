-- Local QA benchmark; no production data or synthetic uptime metric.
\set ON_ERROR_STOP on
begin;
set local statement_timeout='15s';
do $$begin if current_database() not like 'production_catalog_%' then raise exception 'Disposable local database required';end if;end;$$;
create temporary table op_bench(actor uuid default gen_random_uuid(),patient uuid default gen_random_uuid());
insert into op_bench default values;
insert into auth.users(id,email) select actor,'operations-benchmark-admin@qa.invalid' from op_bench union all select patient,'operations-benchmark-patient@qa.invalid' from op_bench;
insert into public.staff_roles(user_id,role) select actor,'super_admin' from op_bench;
select set_config('request.jwt.claim.sub',(select actor::text from op_bench),true);
insert into public.support_cases(patient_id,title,inquiry_source,consent_granted_at,created_at)
 select b.patient,'LOCAL BENCHMARK ONLY','help',now(),now()-interval '48 hours' from op_bench b cross join generate_series(1,1000);
insert into public.support_case_events(case_id,actor_id,action,summary,visibility,created_at)
 select c.id,b.actor,case when g%2=0 then 'inquiry.message_sent' else 'inquiry.task_saved' end,'LOCAL BENCHMARK event only','internal',now()-interval '48 hours' from public.support_cases c cross join op_bench b cross join generate_series(1,20)g where c.title='LOCAL BENCHMARK ONLY';
insert into public.audit_events(actor_id,actor_type,event_name,entity_type,metadata)
 select b.actor,'system','operations.request','operations',jsonb_build_object('correlationId',gen_random_uuid(),'kind','ai','action','execute','outcome','completed','durationMs',10,'retryCount',0,'modelFailures','[]'::jsonb,'recovered',false) from op_bench b cross join generate_series(1,2000);
do $$declare started timestamptz;probe_ms numeric;overview_ms numeric;catalog_ms numeric;i integer;begin
 started:=clock_timestamp();for i in 1..100 loop perform public.operations_probe();end loop;probe_ms:=extract(epoch from(clock_timestamp()-started))*1000/100;
 started:=clock_timestamp();for i in 1..3 loop perform public.operations_overview();end loop;overview_ms:=extract(epoch from(clock_timestamp()-started))*1000/3;
 started:=clock_timestamp();for i in 1..3 loop perform public.public_catalog_snapshot();end loop;catalog_ms:=extract(epoch from(clock_timestamp()-started))*1000/3;
 raise notice 'MEASURED LOCAL QA: 1000 inquiries / 20000 events / 2000 telemetry records; probe mean % ms (100 reads); overview mean % ms (3 reads); public snapshot mean % ms (3 reads)',round(probe_ms,2),round(overview_ms,2),round(catalog_ms,2);
 if overview_ms>5000 or probe_ms>2000 then raise exception 'Operational read exceeded configured budget';end if;
end;$$;
rollback;
