-- Included INSIDE disposable test transactions only. Simulates reviewed
-- reference catalog data; never promotes hosted seeds or publishes providers.
create or replace function pg_temp.qa_publish_references(p_reviewer uuid) returns void
language plpgsql as $$
declare t text;src uuid;
begin
  if current_database() not like 'production_catalog_%' then raise exception 'Disposable production_catalog_* database required';end if;
  insert into public.source_records(source_kind,source_name,source_url,verification_status,retrieved_at,notes)
    values('external','LOCAL VALIDATION reference fixture','https://qa.invalid/reference','unverified',now(),'Disposable database only. Simulated admin review, not real-world information.') returning id into src;
  foreach t in array array['countries','cities','specialties','treatments'] loop
    execute format('update public.%I set source_kind=''external'',source_record_id=$1 where publication_status=''published''',t) using src;
    execute format('insert into public.catalog_drafts(entity,target_id,name,data,status,created_by,approved_by)
      select %L,id,name,jsonb_build_object(''source_kind'',''external'',''source_record_id'',$1),''published'',$2,$2 from public.%I where publication_status=''published''',t,t) using src,p_reviewer;
  end loop;
end;$$;
