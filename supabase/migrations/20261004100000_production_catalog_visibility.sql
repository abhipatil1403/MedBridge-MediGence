-- One production boundary. Synthetic fixtures remain stored, never publicly
-- selectable. Draft edits do not invalidate a previously published snapshot.
alter table public.cities add column if not exists source_kind text not null default 'synthetic'
  check(source_kind in ('synthetic','external','first_party'));
alter table public.cities add column if not exists source_record_id uuid references public.source_records(id);
do $$ begin
  if not exists(select 1 from pg_constraint where conname='cities_non_synthetic_source' and conrelid='public.cities'::regclass) then
    alter table public.cities add constraint cities_non_synthetic_source check(source_kind='synthetic' or source_record_id is not null);
  end if;
end;$$;
create index if not exists catalog_publication_target on public.catalog_drafts(entity,target_id,updated_at desc) where status='published';
create index if not exists provider_public_canonical on public.provider_records(kind,canonical_id) where published_revision is not null;

create or replace function private.catalog_source_allowed(p_kind text,p_source uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select p_kind in ('first_party','external') and exists(
    select 1 from public.source_records s where s.id=p_source and s.source_kind=p_kind
    and s.verification_status not in ('rejected','conflicting','stale'));
$$;
create or replace function private.portal_snapshot_published(p_record uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.provider_records r
    join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision
    join public.organizations o on o.id=r.organization_id
    where r.id=p_record and r.status not in ('archived','expired') and o.status='active'
    and exists(select 1 from public.provider_submission_items i join public.provider_submissions s on s.id=i.submission_id
      where i.record_id=r.id and i.revision=r.published_revision and s.organization_id=r.organization_id and s.status='published'
      and (not s.requires_section_review or (select sr.status='approved' from public.provider_section_reviews sr
        where sr.submission_id=s.id and sr.record_id=r.id and sr.revision=i.revision order by sr.sequence desc limit 1))));
$$;
create or replace function private.portal_published(p_kind text,p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.provider_records r join public.organizations o on o.id=r.organization_id
    where r.canonical_id=p_id and r.kind=case p_kind when 'hospital' then 'organization' else p_kind end
    and private.portal_snapshot_published(r.id)
    and exists(select 1 from public.provider_records profile where profile.organization_id=o.id and profile.kind='organization'
      and profile.canonical_id=o.hospital_id and private.portal_snapshot_published(profile.id)));
$$;
create or replace function private.catalog_governed(p_entity text,p_id uuid,p_kind text,p_source uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.catalog_source_allowed(p_kind,p_source) and case
    when p_entity in ('hospitals','doctors','packages') and exists(select 1 from public.provider_records r where r.canonical_id=p_id and r.kind in ('organization','doctor','package')) then
      private.portal_published(case p_entity when 'hospitals' then 'hospital' when 'doctors' then 'doctor' else 'package' end,p_id)
      and exists(select 1 from public.provider_records r join public.organizations o on o.id=r.organization_id
        join public.source_records s on s.id=p_source
        where r.canonical_id=p_id and r.kind=case p_entity when 'hospitals' then 'organization' when 'doctors' then 'doctor' else 'package' end
        and o.source_kind=p_kind and o.source_kind='first_party'
        and s.source_identifier='provider-record:'||r.id||':revision:'||r.published_revision)
    else exists(select 1 from public.catalog_drafts d where d.entity=p_entity and d.target_id=p_id
      and d.status='published' and d.approved_by is not null
      and coalesce(d.data->>'source_kind',p_kind)=p_kind and (d.data->>'source_record_id')::uuid=p_source)
    end;
$$;

-- Security definer avoids policy recursion, reads only allowlisted canonical
-- tables, and follows an acyclic parent graph. No private rows are returned.
create or replace function private.catalog_public_visible(p_entity text,p_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare x jsonb; table_name text;
begin
  table_name:=case p_entity when 'hospital' then 'hospitals' when 'doctor' then 'doctors' when 'package' then 'packages' else p_entity end;
  if table_name not in ('countries','cities','specialties','conditions','treatments','hospitals','doctors','packages','healthcare_services','price_estimates') then return false;end if;
  execute format('select to_jsonb(t) from public.%I t where id=$1',table_name) into x using p_id;
  if x is null or not private.catalog_source_allowed(x->>'source_kind',nullif(x->>'source_record_id','')::uuid) then return false;end if;
  if table_name='conditions' then
    return exists(select 1 from public.source_records s where s.id=(x->>'source_record_id')::uuid and s.verification_status='verified');
  end if;
  if (case when table_name='healthcare_services' then x->>'status' else x->>'publication_status' end) is distinct from 'published' then return false;end if;
  if table_name='price_estimates' then
    return x->>'verification_status'='verified'
      and (nullif(x->>'effective_from','') is null or (x->>'effective_from')::date<=current_date)
      and (nullif(x->>'expires_on','') is null or (x->>'expires_on')::date>=current_date)
      and private.catalog_public_visible('treatments',(x->>'treatment_id')::uuid)
      and private.catalog_public_visible('countries',(x->>'country_id')::uuid)
      and (x->>'hospital_id' is null or private.catalog_public_visible('hospitals',(x->>'hospital_id')::uuid))
      and (x->>'package_id' is null or private.catalog_public_visible('packages',(x->>'package_id')::uuid));
  end if;
  if not private.catalog_governed(table_name,p_id,x->>'source_kind',(x->>'source_record_id')::uuid) then return false;end if;
  if table_name='cities' then return private.catalog_public_visible('countries',(x->>'country_id')::uuid);
  elsif table_name='treatments' then return private.catalog_public_visible('specialties',(x->>'specialty_id')::uuid);
  elsif table_name='hospitals' then
    return x->>'verification_status' not in ('archived','suspended') and private.catalog_public_visible('cities',(x->>'city_id')::uuid);
  elsif table_name='doctors' then
    return x->>'verification_status' not in ('archived','suspended')
      and (x->>'home_city_id' is null or private.catalog_public_visible('cities',(x->>'home_city_id')::uuid))
      and (not exists(select 1 from public.provider_records r where r.kind='doctor' and r.canonical_id=p_id)
        or exists(select 1 from public.provider_records r join public.organizations o on o.id=r.organization_id
          where r.kind='doctor' and r.canonical_id=p_id and private.catalog_public_visible('hospitals',o.hospital_id)));
  elsif table_name='packages' then
    return x->>'status'='active'
      and (x->>'valid_from' is null or (x->>'valid_from')::date<=current_date)
      and (x->>'valid_until' is null or (x->>'valid_until')::date>=current_date)
      and private.catalog_public_visible('treatments',(x->>'treatment_id')::uuid)
      and private.catalog_public_visible('countries',(x->>'country_id')::uuid)
      and (x->>'hospital_id' is null or private.catalog_public_visible('hospitals',(x->>'hospital_id')::uuid));
  end if;
  return true;
end;$$;
create or replace function private.portal_public_visible(p_kind text,p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$ select private.catalog_public_visible(p_kind,p_id); $$;
revoke all on function private.catalog_source_allowed(text,uuid),private.portal_snapshot_published(uuid),private.catalog_governed(text,uuid,text,uuid),private.catalog_public_visible(text,uuid),private.portal_public_visible(text,uuid) from public;
grant execute on function private.catalog_public_visible(text,uuid),private.catalog_source_allowed(text,uuid) to anon,authenticated;

do $$ declare t text; policy_name text;begin
  foreach t in array array['countries','cities','specialties','conditions','treatments','hospitals','doctors','packages','healthcare_services','price_estimates'] loop
    policy_name:=case when t='healthcare_services' then 'services_public' else t||'_public' end;
    execute format('drop policy if exists %I on public.%I',policy_name,t);
    execute format('create policy %I on public.%I for select to anon,authenticated using(private.catalog_public_visible(%L,id))',policy_name,t,t);
  end loop;
end;$$;
drop policy if exists treatment_conditions_public on public.treatment_conditions;
create policy treatment_conditions_public on public.treatment_conditions for select to anon,authenticated using(private.catalog_public_visible('treatments',treatment_id) and private.catalog_public_visible('conditions',condition_id));
-- Source records are private: use a definer check for relation provenance.
create or replace function private.catalog_link_source(p_source uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.source_records s where s.id=p_source and private.catalog_source_allowed(s.source_kind,s.id));
$$;
revoke all on function private.catalog_link_source(uuid) from public;
grant execute on function private.catalog_link_source(uuid) to anon,authenticated;
drop policy if exists treatment_countries_public on public.treatment_countries;
create policy treatment_countries_public on public.treatment_countries for select to anon,authenticated using(private.catalog_public_visible('treatments',treatment_id) and private.catalog_public_visible('countries',country_id) and private.catalog_link_source(source_record_id));
drop policy if exists hospital_specialties_public on public.hospital_specialties;
create policy hospital_specialties_public on public.hospital_specialties for select to anon,authenticated using(private.catalog_public_visible('hospitals',hospital_id) and private.catalog_public_visible('specialties',specialty_id));
drop policy if exists hospital_treatments_public on public.hospital_treatments;
create policy hospital_treatments_public on public.hospital_treatments for select to anon,authenticated using(private.catalog_public_visible('hospitals',hospital_id) and private.catalog_public_visible('treatments',treatment_id) and private.catalog_link_source(source_record_id));
drop policy if exists doctor_specialties_public on public.doctor_specialties;
create policy doctor_specialties_public on public.doctor_specialties for select to anon,authenticated using(private.catalog_public_visible('doctors',doctor_id) and private.catalog_public_visible('specialties',specialty_id));
drop policy if exists doctor_treatments_public on public.doctor_treatments;
create policy doctor_treatments_public on public.doctor_treatments for select to anon,authenticated using(private.catalog_public_visible('doctors',doctor_id) and private.catalog_public_visible('treatments',treatment_id));
drop policy if exists hospital_doctors_public on public.hospital_doctors;
create policy hospital_doctors_public on public.hospital_doctors for select to anon,authenticated using(private.catalog_public_visible('hospitals',hospital_id) and private.catalog_public_visible('doctors',doctor_id) and private.catalog_link_source(source_record_id) and (starts_on is null or starts_on<=current_date) and (ends_on is null or ends_on>=current_date));
drop policy if exists package_inclusions_public on public.package_inclusions;
create policy package_inclusions_public on public.package_inclusions for select to anon,authenticated using(private.catalog_public_visible('packages',package_id));
drop policy if exists package_exclusions_public on public.package_exclusions;
create policy package_exclusions_public on public.package_exclusions for select to anon,authenticated using(private.catalog_public_visible('packages',package_id));

-- Reuse established publication commands; add only reference validation. The
-- legacy implementation retains role, evidence, audit and concurrency gates.
do $$begin
  if to_regprocedure('private.portal_project_record_previous(uuid,integer)') is null then
    alter function private.portal_project_record(uuid,integer) rename to portal_project_record_previous;
  end if;
end;$$;
create or replace function private.portal_project_record(p_record uuid,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare r public.provider_records;v public.provider_revisions;o public.organizations;ref text;
begin
  select * into r from public.provider_records where id=p_record;
  select * into v from public.provider_revisions where record_id=p_record and revision=p_revision;
  select * into o from public.organizations where id=r.organization_id;
  if o.source_kind<>'synthetic' then
    if (r.kind in ('organization','location') and not private.catalog_public_visible('cities',(v.data->>'cityId')::uuid))
      or (r.kind in ('specialty','doctor') and not private.catalog_public_visible('specialties',(v.data->>'specialtyId')::uuid))
      or (r.kind in ('treatment','package') and not private.catalog_public_visible('treatments',(v.data->>'treatmentId')::uuid)) then raise exception 'PORTAL_PUBLIC_REFERENCE_REQUIRED';end if;
    if r.kind='doctor' then
      for ref in select jsonb_array_elements_text(coalesce(v.data->'treatmentIds','[]'::jsonb)) loop
        if not private.catalog_public_visible('treatments',ref::uuid) then raise exception 'PORTAL_PUBLIC_REFERENCE_REQUIRED';end if;
      end loop;
    end if;
  end if;
  perform private.portal_project_record_previous(p_record,p_revision);
end;$$;
revoke all on function private.portal_project_record(uuid,integer),private.portal_project_record_previous(uuid,integer) from public,anon,authenticated;

-- HTTPS links containing query/fragment credentials, userinfo, or storage URLs
-- are not public evidence links. Raw notes and reviewer identities stay private.
create or replace function private.catalog_public_url(p_url text) returns text language sql immutable set search_path='' as $$
  select case when p_url ~ '^https://[^/?#@[:space:]]+(/[^?#[:space:]]*)?$'
    and p_url !~* '/storage/v1/' then p_url else null end;
$$;
revoke all on function private.catalog_public_url(text) from public;
create or replace function public.public_provider_profile(p_hospital_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid;result jsonb;
begin
  if not private.catalog_public_visible('hospitals',p_hospital_id) then return '{}'::jsonb;end if;
  select id into org from public.organizations where hospital_id=p_hospital_id and source_kind='first_party' and status='active';
  if org is null then return '{}'::jsonb;end if;
  select jsonb_build_object('website',private.catalog_public_url(v.data->>'website'),'phone',nullif(v.data->>'phone',''),'email',nullif(v.data->>'email',''),'address',nullif(v.data->>'address',''),'state',v.data->'state','postalCode',v.data->'postalCode','yearEstablished',v.data->'yearEstablished') into result
    from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision where r.organization_id=org and r.kind='organization' and private.portal_snapshot_published(r.id);
  return coalesce(result,'{}'::jsonb)||jsonb_build_object(
    'locations',coalesce((select jsonb_agg(jsonb_build_object('name',v.name,'address',v.data->'address','city',(select name from public.cities where id=(v.data->>'cityId')::uuid),'phone',v.data->'phone')) from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision where r.organization_id=org and r.kind='location' and private.portal_snapshot_published(r.id) and private.catalog_public_visible('cities',(v.data->>'cityId')::uuid)),'[]'::jsonb),
    'sections',coalesce((select jsonb_agg(jsonb_build_object('kind',r.kind,'name',v.name,'description',v.data->'description','department',v.data->'department','availability',v.data->'availability','category',v.data->'category','eligibilityNote',v.data->'eligibilityNote','quantity',v.data->'quantity','facilityType',v.data->'facilityType')) from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision where r.organization_id=org and r.kind in ('specialty','treatment','facility') and private.portal_snapshot_published(r.id) and (r.kind='facility' or private.catalog_public_visible(case r.kind when 'specialty' then 'specialties' else 'treatments' end,r.canonical_id))),'[]'::jsonb),
    'accreditations',coalesce((select jsonb_agg(jsonb_build_object('name',v.name,'body',v.data->'body','expiresOn',v.data->'expiresOn','status','verified')) from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision where r.organization_id=org and r.kind='accreditation' and private.portal_snapshot_published(r.id) and (nullif(v.data->>'expiresOn','') is null or (v.data->>'expiresOn')::date>=current_date)
      and exists(select 1 from public.provider_documents d where d.id=(v.data->>'documentId')::uuid and d.organization_id=org and d.status='approved' and (d.expires_on is null or d.expires_on>=current_date))
      and (select f.status='verified' and (f.expires_on is null or f.expires_on>=current_date) from public.provider_field_reviews f where f.record_id=r.id and f.revision=r.published_revision and f.field='body' order by f.sequence desc limit 1)),'[]'::jsonb),
    'internationalServices',coalesce((select jsonb_agg(jsonb_build_object('name',v.name,'description',v.data->'description','languages',v.data->'languages','availability',v.data->'availability')) from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision where r.organization_id=org and r.kind='international_service' and private.portal_snapshot_published(r.id)),'[]'::jsonb),
    'fieldReviews',coalesce((select jsonb_agg(jsonb_build_object('field',x.field,'status',case when x.expires_on<current_date or (x.document_id is not null and not exists(select 1 from public.provider_documents d where d.id=x.document_id and d.organization_id=org and d.status='approved' and (d.expires_on is null or d.expires_on>=current_date))) then 'stale' else x.status end,'sourceUrl',private.catalog_public_url(x.source_url),'checkedAt',x.created_at,'expiresOn',x.expires_on)) from (select distinct on(f.field) f.* from public.provider_field_reviews f join public.provider_records r on r.id=f.record_id and r.published_revision=f.revision where r.organization_id=org and r.kind='organization' order by f.field,f.sequence desc)x),'[]'::jsonb));
end;$$;
create or replace function public.public_provider_image(p_doctor_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('path',d.storage_path,'mime',d.mime_type) from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision join public.provider_documents d on d.id=nullif(v.data->>'imageDocumentId','')::uuid
  where r.canonical_id=p_doctor_id and r.kind='doctor' and private.catalog_public_visible('doctors',p_doctor_id) and d.organization_id=r.organization_id and d.status='approved' and d.document_type='profile_image' and d.mime_type in ('image/jpeg','image/png') and (d.expires_on is null or d.expires_on>=current_date) limit 1;
$$;
revoke all on function public.public_provider_image(uuid) from public,anon,authenticated;
grant execute on function public.public_provider_image(uuid) to service_role;

create or replace function public.public_catalog_provenance() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb:='[]'::jsonb;t text;part jsonb;
begin
  foreach t in array array['countries','cities','specialties','treatments','hospitals','doctors','packages','healthcare_services'] loop
    execute format($q$select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'origin',case when exists(select 1 from public.provider_records r where r.canonical_id=c.id and r.kind in ('organization','doctor','package')) then 'provider_published' else 'admin_created' end,'sourceName',s.source_name,'sourceUrl',private.catalog_public_url(s.source_url),'checkedAt',s.retrieved_at,'verification',s.verification_status)),'[]'::jsonb) from public.%I c join public.source_records s on s.id=c.source_record_id where private.catalog_public_visible(%L,c.id)$q$,t,t) into part;
    result:=result||part;
  end loop;
  return result;
end;$$;
revoke all on function public.public_catalog_provenance() from public;
grant execute on function public.public_catalog_provenance() to anon,authenticated;

-- The existing catalog command remains the single admin edit/review/publish
-- implementation. Include the newly classified city fields in its allowlist.
do $$ declare definition text;begin
  select pg_get_functiondef('public.portal_catalog_command(text,jsonb)'::regprocedure) into definition;
  definition:=replace(definition, 'when ''cities'' then array[''slug'',''name'',''country_id'',''aliases'']', 'when ''cities'' then array[''slug'',''name'',''country_id'',''aliases'',''source_kind'',''source_record_id'']');
  execute definition;
end;$$;
