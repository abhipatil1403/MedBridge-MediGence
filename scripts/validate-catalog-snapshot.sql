\set ON_ERROR_STOP on
begin;
do $$begin if current_database() not like 'production_catalog_%' then raise exception 'Isolated local validation database required';end if;end $$;
create function pg_temp.snapshot_assert(ok boolean,msg text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',msg;end if;raise notice 'PASS: %',msg;end $$;
set local role anon;
do $$declare snapshot jsonb;expected jsonb;t text;actual jsonb;begin
 snapshot:=public.public_catalog_snapshot();
 foreach t in array array['countries','cities','specialties','treatments','treatment_countries','hospital_specialties','hospital_treatments','doctor_specialties','doctor_treatments','hospital_doctors','packages','package_inclusions','package_exclusions','healthcare_services','price_estimates'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]'') from public.%I r',t) into expected;
  select coalesce(jsonb_agg(r order by r::text),'[]') into actual from jsonb_array_elements(snapshot->t) r;
  perform pg_temp.snapshot_assert(actual=expected,t||' exactly matches ordinary anonymous RLS reads');
 end loop;
 perform pg_temp.snapshot_assert(snapshot->'package_details'=public.public_provider_package_details(),'published package revision and services unchanged');
 perform pg_temp.snapshot_assert(snapshot->'hospital_details'=public.public_provider_hospital_details(),'safe published hospital DTO unchanged');
 perform pg_temp.snapshot_assert(snapshot->'reference_locations'=public.public_reference_locations(),'exact reference branch locations unchanged');
 perform pg_temp.snapshot_assert(snapshot->'provenance'=public.public_catalog_provenance(),'publication provenance unchanged');
 perform pg_temp.snapshot_assert(not exists(select 1 from jsonb_array_elements(snapshot->'hospitals') r where r ?| array['verified_by','verification_notes','accreditation_notes','actor_id','storage_path']),'hospital private fields excluded');
 perform pg_temp.snapshot_assert(not exists(select 1 from jsonb_array_elements(snapshot->'doctors') r where r ?| array['verified_by','verification_notes','actor_id','storage_path']),'doctor private fields excluded');
 perform pg_temp.snapshot_assert(jsonb_array_length(snapshot->'hospitals')=(select count(*) from public.hospitals),'all and only anonymous hospitals');
 perform pg_temp.snapshot_assert(jsonb_array_length(snapshot->'doctors')=(select count(*) from public.doctors),'all and only anonymous doctors');
 perform pg_temp.snapshot_assert((snapshot->>'databaseMs')::numeric>=0,'database duration recorded without private identifiers');
end $$;
reset role;
select pg_temp.snapshot_assert(not (select prosecdef from pg_proc where oid='public.public_catalog_snapshot()'::regprocedure),'snapshot cannot bypass caller RLS');
rollback;
\echo Atomic public snapshot equivalence and column privacy passed.
