-- Published external and first-party facts must have a traceable source.
alter table public.countries add column source_record_id uuid references public.source_records(id);
alter table public.specialties add column source_record_id uuid references public.source_records(id);
alter table public.conditions add column source_record_id uuid references public.source_records(id);
alter table public.healthcare_services add column source_record_id uuid references public.source_records(id);

alter table public.countries add constraint countries_non_synthetic_source
  check (source_kind = 'synthetic' or source_record_id is not null);
alter table public.specialties add constraint specialties_non_synthetic_source
  check (source_kind = 'synthetic' or source_record_id is not null);
alter table public.conditions add constraint conditions_non_synthetic_source
  check (source_kind = 'synthetic' or source_record_id is not null);
alter table public.healthcare_services add constraint services_non_synthetic_source
  check (source_kind = 'synthetic' or source_record_id is not null);
alter table public.treatments add constraint treatments_non_synthetic_source
  check (source_kind = 'synthetic' or source_record_id is not null);
alter table public.hospitals add constraint hospitals_non_synthetic_source
  check (source_kind = 'synthetic' or source_record_id is not null);
alter table public.doctors add constraint doctors_non_synthetic_source
  check (source_kind = 'synthetic' or source_record_id is not null);
alter table public.packages add constraint packages_non_synthetic_source
  check (source_kind = 'synthetic' or source_record_id is not null);
alter table public.price_estimates add constraint prices_non_synthetic_source
  check (source_kind = 'synthetic' or source_record_id is not null);

-- Availability and affiliation are separate claims from provider identity.
alter table public.treatment_countries alter column source_record_id set not null;
alter table public.hospital_treatments alter column source_record_id set not null;
alter table public.hospital_doctors alter column source_record_id set not null;
