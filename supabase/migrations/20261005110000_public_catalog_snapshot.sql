-- One request and one consistent MVCC snapshot; no cached publication state.
-- SECURITY INVOKER deliberately preserves the caller's ordinary table RLS and
-- column grants. Hospital/doctor projections omit private verification columns.
create or replace function public.public_catalog_snapshot()
returns jsonb language plpgsql stable security invoker
set search_path = public, pg_temp
as $$
declare started timestamptz := clock_timestamp(); result jsonb;
begin
  select jsonb_build_object(
    'countries', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.countries r),
    'cities', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.cities r),
    'specialties', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.specialties r),
    'treatments', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.treatments r),
    'treatment_countries', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.treatment_countries r),
    'hospitals', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from (select id,slug,name,city_id,description,aliases,bed_count,infrastructure,verification_status,verification_date,last_verified_at,source_kind,publication_status,source_record_id,created_at,updated_at from public.hospitals) r),
    'hospital_specialties', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.hospital_specialties r),
    'hospital_treatments', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.hospital_treatments r),
    'doctors', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from (select id,slug,name,description,aliases,home_city_id,experience_years,languages,consultation_mode,qualifications_note,verification_status,verification_date,last_verified_at,source_kind,publication_status,source_record_id,created_at,updated_at from public.doctors) r),
    'doctor_specialties', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.doctor_specialties r),
    'doctor_treatments', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.doctor_treatments r),
    'hospital_doctors', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.hospital_doctors r),
    'packages', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.packages r),
    'package_inclusions', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.package_inclusions r),
    'package_exclusions', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.package_exclusions r),
    'healthcare_services', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.healthcare_services r),
    'price_estimates', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.price_estimates r),
    'package_details', public.public_provider_package_details(),
    'hospital_details', public.public_provider_hospital_details(),
    'reference_locations', public.public_reference_locations(),
    'provenance', public.public_catalog_provenance()
  ) into result;
  return result || jsonb_build_object('databaseMs', round(extract(epoch from clock_timestamp()-started)*1000, 2));
end;
$$;
revoke all on function public.public_catalog_snapshot() from public;
grant execute on function public.public_catalog_snapshot() to anon, authenticated;
