\set ON_ERROR_STOP on
begin;
do $$ declare t text; expected uuid[]; actual uuid[]; plan jsonb; begin
  if current_database() not like 'production_catalog_%' then raise exception 'Disposable database required'; end if;
  foreach t in array array['countries','cities','specialties','conditions','treatments','hospitals','doctors','packages','healthcare_services','price_estimates'] loop
    execute format('select coalesce(array_agg(id order by id),array[]::uuid[]) from public.%I where private.catalog_public_visible(%L,id)',t,t) into expected;
    select coalesce(array_agg(id order by id),array[]::uuid[]) into actual from unnest(private.catalog_public_ids(t)) id;
    if expected is distinct from actual then raise exception 'Visibility changed for %',t; end if;
  end loop;
  if cardinality(private.catalog_public_ids('staff_roles'))<>0 then raise exception 'Entity allowlist failed'; end if;
  set local role anon;
  execute 'explain (verbose,format json) select * from public.hospital_doctors' into plan;
  if plan::text not like '%InitPlan%' or plan::text not like '%catalog_public_ids%' then raise exception 'Public parent checks are not statement-scoped'; end if;
end;$$;
rollback;
