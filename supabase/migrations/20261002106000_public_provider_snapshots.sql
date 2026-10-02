create function public.public_provider_profile(p_hospital_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid;result jsonb;begin
  if not private.portal_published('hospital',p_hospital_id) then return '{}'::jsonb;end if;
  select id into org from public.organizations where hospital_id=p_hospital_id;
  select jsonb_build_object('website',v.data->'website','phone',v.data->'phone','email',v.data->'email','address',v.data->'address','state',v.data->'state','postalCode',v.data->'postalCode','yearEstablished',v.data->'yearEstablished') into result
    from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision where r.organization_id=org and r.kind='organization';
  return result||jsonb_build_object(
    'locations',coalesce((select jsonb_agg(jsonb_build_object('name',v.name,'address',v.data->'address','city',(select name from public.cities where id=(v.data->>'cityId')::uuid),'phone',v.data->'phone')) from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision where r.organization_id=org and r.kind='location'),'[]'::jsonb),
    'accreditations',coalesce((select jsonb_agg(jsonb_build_object('name',v.name,'body',v.data->'body','expiresOn',v.data->'expiresOn')) from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision where r.organization_id=org and r.kind='accreditation' and (nullif(v.data->>'expiresOn','') is null or (v.data->>'expiresOn')::date>=current_date) and exists(select 1 from public.provider_documents d where d.id=(v.data->>'documentId')::uuid and d.status='approved' and (d.expires_on is null or d.expires_on>=current_date))),'[]'::jsonb),
    'internationalServices',coalesce((select jsonb_agg(jsonb_build_object('name',v.name,'description',v.data->'description','languages',v.data->'languages')) from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision where r.organization_id=org and r.kind='international_service'),'[]'::jsonb),
    'fieldReviews',coalesce((select jsonb_agg(jsonb_build_object('field',x.field,'status',case when x.expires_on<current_date or (x.document_id is not null and not exists(select 1 from public.provider_documents d where d.id=x.document_id and d.status='approved' and (d.expires_on is null or d.expires_on>=current_date))) then 'stale' else x.status end,'sourceUrl',x.source_url,'checkedAt',x.created_at,'expiresOn',x.expires_on,'evidence',x.evidence)) from (select distinct on(f.field) f.* from public.provider_field_reviews f join public.provider_records r on r.id=f.record_id and r.published_revision=f.revision where r.organization_id=org and r.kind='organization' order by f.field,f.sequence desc)x),'[]'::jsonb));
end;$$;
-- Only profile images explicitly referenced by a published, reviewed doctor snapshot are public.
create function public.public_provider_record(p_kind text,p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('professionalTitle',v.data->'professionalTitle','department',v.data->'department','terms',v.data->'terms','validFrom',v.data->'validFrom','validUntil',v.data->'validUntil','hasImage',
    exists(select 1 from public.provider_documents d where d.id=nullif(v.data->>'imageDocumentId','')::uuid and d.organization_id=r.organization_id and d.status='approved' and d.document_type='profile_image' and d.mime_type in ('image/jpeg','image/png') and (d.expires_on is null or d.expires_on>=current_date)))
  from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision where r.kind=p_kind and p_kind in ('doctor','package') and r.canonical_id=p_id and private.portal_published(p_kind,p_id) limit 1;
$$;
create function public.public_provider_image(p_doctor_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('path',d.storage_path,'mime',d.mime_type) from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision join public.provider_documents d on d.id=nullif(v.data->>'imageDocumentId','')::uuid
  where r.canonical_id=p_doctor_id and r.kind='doctor' and private.portal_published('doctor',p_doctor_id) and d.organization_id=r.organization_id and d.status='approved' and d.document_type='profile_image' and d.mime_type in ('image/jpeg','image/png') and (d.expires_on is null or d.expires_on>=current_date) limit 1;
$$;
revoke all on function public.public_provider_profile(uuid) from public;
grant execute on function public.public_provider_profile(uuid) to anon,authenticated;
revoke all on function public.public_provider_record(text,uuid) from public;
grant execute on function public.public_provider_record(text,uuid) to anon,authenticated;
revoke all on function public.public_provider_image(uuid) from public,anon,authenticated;
grant execute on function public.public_provider_image(uuid) to service_role;
