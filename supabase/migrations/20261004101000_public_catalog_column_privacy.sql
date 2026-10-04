-- Retain the prior verified-identity gate for admin-managed hospital/doctor
-- records. Provider publications retain their governed immutable snapshots.
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
      and case p_entity
        when 'hospitals' then exists(select 1 from public.hospitals h where h.id=p_id and h.verification_status='verified')
        when 'doctors' then exists(select 1 from public.doctors d where d.id=p_id and d.verification_status='verified')
        else true end
    end;
$$;
revoke all on function private.catalog_governed(text,uuid,text,uuid) from public,anon,authenticated;

-- Row visibility does not conceal columns. Canonical verification actor IDs
-- and internal verification text stay server-only; safe public status and
-- dates remain selectable. Private review history uses its existing RLS.
revoke select on public.hospitals,public.doctors from anon,authenticated;
grant select(id,slug,name,city_id,description,aliases,bed_count,infrastructure,
  verification_status,verification_date,last_verified_at,source_kind,publication_status,source_record_id,created_at,updated_at)
  on public.hospitals to anon,authenticated;
grant select(id,slug,name,description,aliases,home_city_id,experience_years,languages,consultation_mode,qualifications_note,
  verification_status,verification_date,last_verified_at,source_kind,publication_status,source_record_id,created_at,updated_at)
  on public.doctors to anon,authenticated;
