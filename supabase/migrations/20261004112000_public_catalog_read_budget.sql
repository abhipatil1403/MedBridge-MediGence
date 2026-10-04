-- Evaluate the existing visibility boundary once per statement/entity. This
-- avoids repeating full publication/claim checks for every historical QA link.
-- No result is cached across requests and all original checks still apply.
create or replace function private.catalog_public_ids(p_entity text) returns uuid[]
language plpgsql stable security definer set search_path='' as $$
declare result uuid[]; predicate text;
begin
  if p_entity not in ('countries','cities','specialties','conditions','treatments','hospitals','doctors','packages','healthcare_services','price_estimates') then return array[]::uuid[]; end if;
  predicate:=case p_entity when 'conditions' then 'true' when 'healthcare_services' then 'c.status=''published''' else 'c.publication_status=''published''' end;
  execute format('select coalesce(array_agg(c.id),array[]::uuid[]) from public.%I c where c.source_kind in (''external'',''first_party'') and %s and private.catalog_public_visible(%L,c.id)',p_entity,predicate,p_entity) into result;
  return result;
end;$$;
revoke all on function private.catalog_public_ids(text) from public;
grant execute on function private.catalog_public_ids(text) to anon,authenticated;

do $$ declare t text; policy_name text; begin
  foreach t in array array['countries','cities','specialties','conditions','treatments','hospitals','doctors','packages','healthcare_services','price_estimates'] loop
    policy_name:=case when t='healthcare_services' then 'services_public' else t||'_public' end;
    execute format('drop policy if exists %I on public.%I',policy_name,t);
    execute format('create policy %I on public.%I for select to anon,authenticated using(id=any((select private.catalog_public_ids(%L))::uuid[]))',policy_name,t,t);
  end loop;
end;$$;

do $$ declare p record; d text; begin
  -- Preserve relation-specific source, date and all additional policy checks.
  for p in select pol.polname,cl.relname,pg_get_expr(pol.polqual,pol.polrelid) as expression
    from pg_policy pol join pg_class cl on cl.oid=pol.polrelid join pg_namespace n on n.oid=cl.relnamespace
    where n.nspname='public' and pol.polname in ('treatment_conditions_public','treatment_countries_public','hospital_specialties_public','hospital_treatments_public','doctor_specialties_public','doctor_treatments_public','hospital_doctors_public','package_inclusions_public','package_exclusions_public') loop
    d:=regexp_replace(p.expression,'private.catalog_public_visible\(''([^'']+)''::text, ([a-z_]+)\)', '\2=any((select private.catalog_public_ids(''\1''))::uuid[])','g');
    if d=p.expression and d not like '%catalog_public_ids%' then raise exception 'PUBLIC_RELATION_POLICY_NOT_UPDATED: %',p.polname; end if;
    execute format('alter policy %I on public.%I using(%s)',p.polname,p.relname,d);
  end loop;

  d:=pg_get_functiondef('public.public_catalog_provenance()'::regprocedure);
  d:=replace(d,'where private.catalog_public_visible(%L,c.id)','where c.id=any((select private.catalog_public_ids(%L))::uuid[])'); execute d;
  d:=pg_get_functiondef('public.public_provider_hospital_details()'::regprocedure);
  d:=replace(d,'private.portal_public_visible(''hospital'',h.id)','h.id=any((select private.catalog_public_ids(''hospitals''))::uuid[])'); execute d;
  d:=pg_get_functiondef('public.public_reference_locations()'::regprocedure);
  d:=replace(d,'private.catalog_public_visible(''hospitals'',o.hospital_id)','o.hospital_id=any((select private.catalog_public_ids(''hospitals''))::uuid[])'); execute d;
  d:=pg_get_functiondef('public.public_reference_claims(text,uuid)'::regprocedure);
  d:=replace(d,'and private.catalog_public_visible(case p_kind','and (select private.catalog_public_visible(case p_kind');
  d:=replace(d,'end,p_id);','end,p_id));'); execute d;
end;$$;

create index if not exists provider_field_review_current on public.provider_field_reviews(record_id,revision,field,sequence desc);
create index if not exists provider_submission_published_lookup on public.provider_submission_items(record_id,revision,submission_id);

notify pgrst,'reload schema';
