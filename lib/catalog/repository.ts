import 'server-only';
import { cache } from 'react';
import { z } from 'zod';
import { getPublicSupabaseClient } from '@/lib/supabase/server';
import type { CatalogCandidates, CatalogKind, CatalogRepository, Country, Doctor, Hospital, Package, PriceEstimate, Service, Treatment } from '@/types/catalog';
import type { ParsedQuery } from '@/types/discovery';

const faqSchema = z.array(z.object({ question: z.string(), answer: z.string() }));
const kinds: CatalogKind[] = ['treatments', 'hospitals', 'doctors', 'packages', 'countries', 'services'];
function required<T>(item: T | undefined, label: string): T { if (!item) throw new Error(`Missing catalog relationship: ${label}`); return item; }
function rows<T>(data: T[] | null, error: { message: string } | null, label: string): T[] {
  if (error) throw new Error(`Catalog read failed for ${label}: ${error.message}`);
  return data ?? [];
}
function sourceKind(value: string): 'synthetic' | 'external' | 'first_party' {
  if (value === 'synthetic' || value === 'external' || value === 'first_party') return value;
  throw new Error(`Unknown source kind: ${value}`);
}

const loadSnapshot = cache(async () => {
  const db = getPublicSupabaseClient();
  const [countryQuery, cityQuery, specialtyQuery, treatmentQuery, treatmentCountryQuery,
    hospitalQuery, hospitalSpecialtyQuery, hospitalTreatmentQuery, doctorQuery,
    doctorSpecialtyQuery, doctorTreatmentQuery, hospitalDoctorQuery, packageQuery,
    inclusionQuery, exclusionQuery, serviceQuery, priceQuery] = await Promise.all([
    db.from('countries').select('*'), db.from('cities').select('*'), db.from('specialties').select('*'),
    db.from('treatments').select('*'), db.from('treatment_countries').select('*'),
    db.from('hospitals').select('*'), db.from('hospital_specialties').select('*'),
    db.from('hospital_treatments').select('*'), db.from('doctors').select('*'),
    db.from('doctor_specialties').select('*'), db.from('doctor_treatments').select('*'),
    db.from('hospital_doctors').select('*'), db.from('packages').select('*'),
    db.from('package_inclusions').select('*'), db.from('package_exclusions').select('*'),
    db.from('healthcare_services').select('*'), db.from('price_estimates').select('*'),
  ]);
  const countryRows = rows(countryQuery.data, countryQuery.error, 'countries');
  const cityRows = rows(cityQuery.data, cityQuery.error, 'cities');
  const specialtyRows = rows(specialtyQuery.data, specialtyQuery.error, 'specialties');
  const treatmentRows = rows(treatmentQuery.data, treatmentQuery.error, 'treatments');
  const treatmentCountryRows = rows(treatmentCountryQuery.data, treatmentCountryQuery.error, 'treatment countries');
  const hospitalRows = rows(hospitalQuery.data, hospitalQuery.error, 'hospitals');
  const hospitalSpecialtyRows = rows(hospitalSpecialtyQuery.data, hospitalSpecialtyQuery.error, 'hospital specialties');
  const hospitalTreatmentRows = rows(hospitalTreatmentQuery.data, hospitalTreatmentQuery.error, 'hospital treatments');
  const doctorRows = rows(doctorQuery.data, doctorQuery.error, 'doctors');
  const doctorSpecialtyRows = rows(doctorSpecialtyQuery.data, doctorSpecialtyQuery.error, 'doctor specialties');
  const doctorTreatmentRows = rows(doctorTreatmentQuery.data, doctorTreatmentQuery.error, 'doctor treatments');
  const hospitalDoctorRows = rows(hospitalDoctorQuery.data, hospitalDoctorQuery.error, 'hospital doctors');
  const packageRows = rows(packageQuery.data, packageQuery.error, 'packages');
  const inclusionRows = rows(inclusionQuery.data, inclusionQuery.error, 'package inclusions');
  const exclusionRows = rows(exclusionQuery.data, exclusionQuery.error, 'package exclusions');
  const serviceRows = rows(serviceQuery.data, serviceQuery.error, 'healthcare services');
  const priceRows = rows(priceQuery.data, priceQuery.error, 'price estimates');

  const countryById = new Map(countryRows.map((item) => [item.id, item]));
  const cityById = new Map(cityRows.map((item) => [item.id, item]));
  const specialtyById = new Map(specialtyRows.map((item) => [item.id, item]));
  const treatmentById = new Map(treatmentRows.map((item) => [item.id, item]));
  const hospitalById = new Map(hospitalRows.map((item) => [item.id, item]));

  const countries: Country[] = countryRows.map((item) => ({
    slug: item.slug, name: item.name, description: item.description, aliases: item.aliases,
    demo: item.source_kind === 'synthetic', sourceKind: sourceKind(item.source_kind),
    code: item.iso_code.trim(), travelNote: item.travel_note,
  }));
  const estimates: PriceEstimate[] = priceRows.filter((item) => item.currency === 'USD').map((item) => ({
    treatmentSlug: required(treatmentById.get(item.treatment_id), 'price treatment').slug,
    countrySlug: required(countryById.get(item.country_id), 'price country').slug,
    estimatedMinUsd: item.estimated_min, estimatedMaxUsd: item.estimated_max,
    sourceKind: sourceKind(item.source_kind),
  }));
  const treatments: Treatment[] = treatmentRows.map((item) => {
    const treatmentPrices = priceRows.filter((price) => price.treatment_id === item.id && price.currency === 'USD');
    return {
      slug: item.slug, name: item.name, description: item.description, aliases: item.aliases,
      demo: item.source_kind === 'synthetic', sourceKind: sourceKind(item.source_kind),
      specialty: required(specialtyById.get(item.specialty_id), 'treatment specialty').name,
      category: item.category, overview: item.overview, procedure: item.procedure_summary,
      indications: item.indications, diagnostics: item.diagnostics, recovery: item.recovery,
      typicalStayDays: item.typical_stay_days ?? 0,
      sampleBaseCostUsd: treatmentPrices.length ? Math.min(...treatmentPrices.map((price) => price.estimated_min)) : 0,
      countries: treatmentCountryRows.filter((link) => link.treatment_id === item.id)
        .map((link) => required(countryById.get(link.country_id), 'treatment country').slug),
      faqs: faqSchema.parse(item.faqs),
    };
  });
  const hospitals: Hospital[] = hospitalRows.map((item) => {
    const city = required(cityById.get(item.city_id), 'hospital city');
    return {
      slug: item.slug, name: item.name, description: item.description, aliases: item.aliases,
      demo: item.source_kind === 'synthetic', sourceKind: sourceKind(item.source_kind),
      city: city.name, country: required(countryById.get(city.country_id), 'hospital country').slug,
      specialties: hospitalSpecialtyRows.filter((link) => link.hospital_id === item.id)
        .map((link) => required(specialtyById.get(link.specialty_id), 'hospital specialty').name),
      treatmentSlugs: hospitalTreatmentRows.filter((link) => link.hospital_id === item.id)
        .map((link) => required(treatmentById.get(link.treatment_id), 'hospital treatment').slug),
      sampleBedCount: item.bed_count ?? 0, sampleAccreditation: item.accreditation_note ?? 'No credential listed',
      verification: item.source_kind === 'synthetic' ? 'Demo — unverified' : item.verification_status,
      infrastructure: item.infrastructure,
    };
  });
  const doctors: Doctor[] = doctorRows.map((item) => {
    const affiliation = hospitalDoctorRows.find((link) => link.doctor_id === item.id && link.is_primary)
      ?? hospitalDoctorRows.find((link) => link.doctor_id === item.id);
    const hospital = affiliation ? hospitalById.get(affiliation.hospital_id) : undefined;
    const city = item.home_city_id ? cityById.get(item.home_city_id) : undefined;
    const specialtyLink = doctorSpecialtyRows.find((link) => link.doctor_id === item.id && link.is_primary)
      ?? doctorSpecialtyRows.find((link) => link.doctor_id === item.id);
    return {
      slug: item.slug, name: item.name, description: item.description, aliases: item.aliases,
      demo: item.source_kind === 'synthetic', sourceKind: sourceKind(item.source_kind),
      specialty: specialtyLink ? required(specialtyById.get(specialtyLink.specialty_id), 'doctor specialty').name : '',
      hospitalSlug: hospital?.slug ?? '', hospitalName: hospital?.name ?? 'No current affiliation listed',
      city: city?.name ?? '', country: city ? required(countryById.get(city.country_id), 'doctor country').slug : '',
      sampleExperienceYears: item.experience_years ?? 0, languages: item.languages,
      consultationMode: item.consultation_mode === 'video' || item.consultation_mode === 'in-person' ? item.consultation_mode : 'both',
      treatmentSlugs: doctorTreatmentRows.filter((link) => link.doctor_id === item.id)
        .map((link) => required(treatmentById.get(link.treatment_id), 'doctor treatment').slug),
      verification: item.source_kind === 'synthetic' ? 'Demo — unverified' : item.verification_status,
      qualifications: [item.qualifications_note],
    };
  });
  const packages: Package[] = packageRows.map((item) => ({
    slug: item.slug, name: item.name, description: item.description, aliases: item.aliases,
    demo: item.source_kind === 'synthetic', sourceKind: sourceKind(item.source_kind),
    treatmentSlug: required(treatmentById.get(item.treatment_id), 'package treatment').slug,
    hospitalSlug: item.hospital_id ? required(hospitalById.get(item.hospital_id), 'package hospital').slug : '',
    hospitalName: item.hospital_id ? required(hospitalById.get(item.hospital_id), 'package hospital').name : 'Provider to be confirmed',
    country: required(countryById.get(item.country_id), 'package country').slug,
    durationDays: item.duration_days, samplePriceUsd: item.estimated_min,
    inclusions: inclusionRows.filter((link) => link.package_id === item.id).sort((a, b) => a.position - b.position).map((link) => link.description),
    exclusions: exclusionRows.filter((link) => link.package_id === item.id).sort((a, b) => a.position - b.position).map((link) => link.description),
    benefits: item.benefits,
  }));
  const services: Service[] = serviceRows.map((item) => ({
    slug: item.slug, name: item.name, description: item.description, aliases: item.aliases,
    demo: item.source_kind === 'synthetic', sourceKind: sourceKind(item.source_kind),
    href: item.href, category: item.category === 'plan' || item.category === 'recover' ? item.category : 'treat',
    steps: item.steps,
  }));
  return { treatments, hospitals, doctors, packages, countries, services, estimates };
});

export const catalogRepository: CatalogRepository = {
  async listTreatments() { return (await loadSnapshot()).treatments; },
  async listHospitals() { return (await loadSnapshot()).hospitals; },
  async listDoctors() { return (await loadSnapshot()).doctors; },
  async listPackages() { return (await loadSnapshot()).packages; },
  async listCountries() { return (await loadSnapshot()).countries; },
  async listServices() { return (await loadSnapshot()).services; },
  async listPriceEstimates() { return (await loadSnapshot()).estimates; },
  async findCandidateSlugs(parsed: ParsedQuery): Promise<CatalogCandidates> {
    const { data, error } = await getPublicSupabaseClient().rpc('search_catalog_candidates', {
      p_terms: parsed.tokens.join(' '), p_treatment_slug: parsed.entities.procedure ?? null,
      p_specialty: parsed.entities.specialty ?? null, p_countries: [...parsed.entities.countries],
      p_city: parsed.entities.city ?? null,
    });
    const candidates = Object.fromEntries(kinds.map((kind) => [kind, new Set<string>()])) as Record<CatalogKind, Set<string>>;
    for (const match of rows(data, error, 'catalog search')) {
      if (kinds.includes(match.kind as CatalogKind)) candidates[match.kind as CatalogKind].add(match.slug);
    }
    return candidates;
  },
};

export async function getTreatmentBySlug(slug: string) { return (await catalogRepository.listTreatments()).find((item) => item.slug === slug); }
export async function getHospitalBySlug(slug: string) { return (await catalogRepository.listHospitals()).find((item) => item.slug === slug); }
export async function getDoctorBySlug(slug: string) { return (await catalogRepository.listDoctors()).find((item) => item.slug === slug); }
export async function getPackageBySlug(slug: string) { return (await catalogRepository.listPackages()).find((item) => item.slug === slug); }
export async function getServiceBySlug(slug: string) { return (await catalogRepository.listServices()).find((item) => item.slug === slug); }
