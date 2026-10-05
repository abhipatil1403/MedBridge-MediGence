-- Preserve every reference publication condition. Materialize the claim/source
-- and latest-review sets once for a frozen revision instead of rescanning them
-- for each JSON field. This changes query work, never authorization or freshness.
create or replace function private.reference_claims_complete(p_record uuid,p_revision integer,p_reviewed boolean)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare result boolean;
begin
  with revision as materialized (
    select v.organization_id,v.data,v.name from public.provider_revisions v
    where v.record_id=p_record and v.revision=p_revision
  ), latest_reviews as materialized (
    select distinct on (r.field) r.field,r.status,r.source_url,r.expires_on,r.document_id
    from public.provider_field_reviews r where r.record_id=p_record and r.revision=p_revision
    order by r.field,r.sequence desc
  ), valid_claims as materialized (
    select c.field,c.supported_value from public.provider_reference_claims c
    join public.source_records s on s.id=c.source_record_id
    join revision v on v.organization_id=c.organization_id
    left join latest_reviews r on r.field=c.field
    where c.record_id=p_record and c.revision=p_revision
    and s.source_kind='external' and s.source_type is not null
    and private.catalog_public_url(s.source_url) is not null
    and s.retrieved_at is not null and s.retrieved_at<=now()+interval '5 minutes'
    and s.verification_status not in ('rejected','conflicting','stale')
    and (not p_reviewed or (s.review_after is null or s.review_after>=current_date))
    and (not p_reviewed or (
      r.status in ('approved','verified') and r.source_url=s.source_url
      and (r.expires_on is null or r.expires_on>=current_date)
      and (r.document_id is null or exists (
        select 1 from public.provider_documents doc where doc.id=r.document_id
        and doc.status='approved' and (doc.expires_on is null or doc.expires_on>=current_date)
      ))
    ))
  )
  select exists(select 1 from revision) and not exists(
    select 1 from revision v cross join lateral jsonb_each(v.data||jsonb_build_object('name',v.name)) f
    where f.value not in ('null'::jsonb,'""'::jsonb,'[]'::jsonb)
    and not exists(select 1 from valid_claims c where c.field=f.key and c.supported_value=f.value)
  ) into result;
  return result;
end;
$$;
-- The existing helper remains private and retains its grants.
create index if not exists provider_canonical_lookup on public.provider_records(canonical_id,kind) where canonical_id is not null;

-- Restrict the exact identity before invoking expensive claim checks. PostgreSQL
-- may reorder ordinary WHERE expressions and otherwise check every record for
-- each source. MATERIALIZED is a planning boundary, not a persisted data cache.
create or replace function private.catalog_source_allowed(p_kind text,p_source uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare checked boolean;begin
  select p_kind in ('first_party','external') and exists(
    select 1 from public.source_records s where s.id=p_source and s.source_kind=p_kind
    and s.verification_status not in ('rejected','conflicting','stale')
    and (s.source_identifier is null or s.source_identifier not like 'provider-record:%' or p_kind<>'external' or exists(
      with candidate as materialized (
        select r.id,r.published_revision from public.provider_records r
        join public.organizations o on o.id=r.organization_id
        where o.onboarding_origin='admin_reference'
        and s.source_identifier='provider-record:'||r.id||':revision:'||r.published_revision
      ) select 1 from candidate r where private.reference_claims_complete(r.id,r.published_revision,true)
    ))
  ) into checked;return checked;
end;$$;

create or replace function private.portal_snapshot_published(p_record uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare checked boolean;begin
  with candidate as materialized (
    select r.id,r.organization_id,r.published_revision,o.onboarding_origin
    from public.provider_records r
    join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision
    join public.organizations o on o.id=r.organization_id
    where r.id=p_record and r.status not in ('archived','expired') and o.status='active'
  ) select exists(select 1 from candidate r
    where (r.onboarding_origin<>'admin_reference' or private.reference_claims_complete(r.id,r.published_revision,true))
    and exists(select 1 from public.provider_submission_items i
      join public.provider_submissions s on s.id=i.submission_id
      where i.record_id=r.id and i.revision=r.published_revision
      and s.organization_id=r.organization_id and s.status='published'
      and (not s.requires_section_review or (select sr.status='approved' from public.provider_section_reviews sr
        where sr.submission_id=s.id and sr.record_id=r.id and sr.revision=i.revision order by sr.sequence desc limit 1))
    )
  ) into checked;return checked;
end;$$;

create or replace function private.catalog_governed(p_entity text,p_id uuid,p_kind text,p_source uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare checked boolean;begin
  select private.catalog_source_allowed(p_kind,p_source) and case
    when p_entity in ('hospitals','doctors','packages') and exists(select 1 from public.provider_records r where r.canonical_id=p_id and r.kind in ('organization','doctor','package')) then
      private.portal_published(case p_entity when 'hospitals' then 'hospital' when 'doctors' then 'doctor' else 'package' end,p_id)
      and exists(
        with candidate as materialized (
          select r.id,r.published_revision,o.source_kind,o.onboarding_origin
          from public.provider_records r join public.organizations o on o.id=r.organization_id
          join public.source_records s on s.id=p_source
          where r.canonical_id=p_id and r.kind=case p_entity when 'hospitals' then 'organization' when 'doctors' then 'doctor' else 'package' end
          and o.source_kind=p_kind and s.source_identifier='provider-record:'||r.id||':revision:'||r.published_revision
        ) select 1 from candidate r where r.source_kind='first_party'
          or (r.onboarding_origin='admin_reference' and private.reference_claims_complete(r.id,r.published_revision,true))
      )
    else exists(select 1 from public.catalog_drafts d where d.entity=p_entity and d.target_id=p_id
      and d.status='published' and d.approved_by is not null
      and coalesce(d.data->>'source_kind',p_kind)=p_kind and (d.data->>'source_record_id')::uuid=p_source)
      and case p_entity
        when 'hospitals' then exists(select 1 from public.hospitals h where h.id=p_id and h.verification_status='verified')
        when 'doctors' then exists(select 1 from public.doctors d where d.id=p_id and d.verification_status='verified')
        else true end
    end into checked;return checked;
end;$$;
notify pgrst,'reload schema';
