-- Expose only the published version number alongside the existing public DTO.
-- Draft/current revision identifiers and all private review fields stay private.
create or replace function public.public_provider_package_details() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.canonical_id,'publishedRevision',v.revision,
    'serviceDetails',private.portal_package_details(v.data))),'[]'::jsonb)
  from public.provider_records r
  join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision
  where r.kind='package' and private.portal_public_visible('package',r.canonical_id);
$$;
revoke all on function public.public_provider_package_details() from public;
grant execute on function public.public_provider_package_details() to anon,authenticated;
