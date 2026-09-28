-- Invoker rights keep directory search subject to the same RLS policies as table reads.
create function public.search_catalog_candidates(
  p_terms text,
  p_treatment_slug text default null,
  p_specialty text default null,
  p_countries text[] default '{}',
  p_city text default null
) returns table(kind text, slug text)
language sql stable security invoker set search_path = '' as $$
  with input as (
    select nullif(trim(p_terms), '') as terms,
           case when nullif(trim(p_terms), '') is null then null
                else websearch_to_tsquery('simple', p_terms) end as query
  ), matches as (
    select 'treatments'::text kind, t.slug
    from public.treatments t join public.specialties s on s.id = t.specialty_id cross join input i
    where (i.query is not null and (
      to_tsvector('simple', t.name || ' ' || t.description || ' ' || array_to_string(t.aliases, ' ') || ' ' || s.name) @@ i.query
      or exists (select 1 from public.treatment_conditions tc join public.conditions co on co.id = tc.condition_id
                 where tc.treatment_id = t.id and to_tsvector('simple', co.name || ' ' || array_to_string(co.aliases, ' ')) @@ i.query)))
      or (p_treatment_slug is not null and t.slug = p_treatment_slug)
      or (p_specialty is not null and s.name = p_specialty)
      or exists (select 1 from public.treatment_countries tc join public.countries c on c.id = tc.country_id
                 where tc.treatment_id = t.id and c.slug = any(p_countries))
    union all
    select 'hospitals', h.slug
    from public.hospitals h join public.cities ci on ci.id = h.city_id join public.countries c on c.id = ci.country_id cross join input i
    where (i.query is not null and to_tsvector('simple', h.name || ' ' || h.description || ' ' || array_to_string(h.aliases, ' ') || ' ' || ci.name || ' ' || c.name) @@ i.query)
      or (p_city is not null and ci.name = p_city)
      or c.slug = any(p_countries)
      or exists (select 1 from public.hospital_treatments ht where ht.hospital_id = h.id and
        (exists (select 1 from public.treatments t where t.id = ht.treatment_id and
          ((p_treatment_slug is not null and t.slug = p_treatment_slug) or (i.query is not null and
            to_tsvector('simple', t.name || ' ' || array_to_string(t.aliases, ' ')) @@ i.query)))))
      or exists (select 1 from public.hospital_specialties hs join public.specialties s on s.id = hs.specialty_id
        where hs.hospital_id = h.id and p_specialty is not null and s.name = p_specialty)
    union all
    select 'doctors', d.slug
    from public.doctors d left join public.cities ci on ci.id = d.home_city_id
      left join public.countries c on c.id = ci.country_id cross join input i
    where (i.query is not null and to_tsvector('simple', d.name || ' ' || d.description || ' ' || array_to_string(d.aliases, ' ') || ' ' || coalesce(ci.name, '') || ' ' || coalesce(c.name, '')) @@ i.query)
      or c.slug = any(p_countries)
      or exists (select 1 from public.doctor_treatments dt join public.treatments t on t.id = dt.treatment_id
        where dt.doctor_id = d.id and ((p_treatment_slug is not null and t.slug = p_treatment_slug) or
          (i.query is not null and to_tsvector('simple', t.name || ' ' || array_to_string(t.aliases, ' ')) @@ i.query)))
      or exists (select 1 from public.doctor_specialties ds join public.specialties s on s.id = ds.specialty_id
        where ds.doctor_id = d.id and p_specialty is not null and s.name = p_specialty)
    union all
    select 'packages', p.slug
    from public.packages p join public.treatments t on t.id = p.treatment_id
      join public.countries c on c.id = p.country_id cross join input i
    where (i.query is not null and to_tsvector('simple', p.name || ' ' || p.description || ' ' || array_to_string(p.aliases, ' ') || ' ' || t.name || ' ' || c.name) @@ i.query)
      or (p_treatment_slug is not null and t.slug = p_treatment_slug) or c.slug = any(p_countries)
    union all
    select 'countries', c.slug from public.countries c cross join input i
    where (i.query is not null and to_tsvector('simple', c.name || ' ' || array_to_string(c.aliases, ' ')) @@ i.query)
      or c.slug = any(p_countries)
    union all
    select 'services', s.slug from public.healthcare_services s cross join input i
    where i.query is not null and to_tsvector('simple', s.name || ' ' || s.description || ' ' || array_to_string(s.aliases, ' ')) @@ i.query
  ) select distinct kind, slug from matches;
$$;
revoke all on function public.search_catalog_candidates(text, text, text, text[], text) from public;
grant execute on function public.search_catalog_candidates(text, text, text, text[], text) to anon, authenticated;
