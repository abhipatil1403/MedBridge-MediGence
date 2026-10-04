import "server-only";
import { cache } from "react";
import { z } from "zod";
import { getPublicSupabaseClient } from "@/lib/supabase/server";
import type {
  CatalogCandidates,
  CatalogKind,
  CatalogRepository,
  Country,
  Doctor,
  Hospital,
  Package,
  PriceEstimate,
  Service,
  Treatment,
} from "@/types/catalog";
import type { ParsedQuery } from "@/types/discovery";
import { packageServicesSchema } from "./package-services";
import { normalize } from "@/lib/discovery/normalize";
import { publicHospitalFields, publicDoctorFields } from "./public-fields";
import { catalogReadQueue } from "./read-budget";

const faqSchema = z.array(
  z.object({ question: z.string(), answer: z.string() }),
);
const kinds: CatalogKind[] = [
  "treatments",
  "hospitals",
  "doctors",
  "packages",
  "countries",
  "services",
];
function required<T>(item: T | undefined, label: string): T {
  if (!item) throw new Error(`Missing catalog relationship: ${label}`);
  return item;
}
function rows<T>(
  data: T[] | null,
  error: { message: string } | null,
  label: string,
): T[] {
  if (error)
    throw new Error(`Catalog read failed for ${label}: ${error.message}`);
  return data ?? [];
}
function sourceKind(value: string): "synthetic" | "external" | "first_party" {
  if (value === "synthetic" || value === "external" || value === "first_party")
    return value;
  throw new Error(`Unknown source kind: ${value}`);
}

const loadSnapshot = cache(async () => {
  const db = getPublicSupabaseClient();
  const read = catalogReadQueue();
  const [
    countryQuery,
    cityQuery,
    specialtyQuery,
    treatmentQuery,
    treatmentCountryQuery,
    hospitalQuery,
    hospitalSpecialtyQuery,
    hospitalTreatmentQuery,
    doctorQuery,
    doctorSpecialtyQuery,
    doctorTreatmentQuery,
    hospitalDoctorQuery,
    packageQuery,
    inclusionQuery,
    exclusionQuery,
    serviceQuery,
    priceQuery,
    packageDetailsQuery,
    hospitalDetailsQuery,
    provenanceQuery,
    referenceLocationsQuery,
  ] = await Promise.all([
    read(() => db.from("countries").select("*")),
    read(() => db.from("cities").select("*")),
    read(() => db.from("specialties").select("*")),
    read(() => db.from("treatments").select("*")),
    read(() => db.from("treatment_countries").select("*")),
    read(() => db.from("hospitals").select(publicHospitalFields)),
    read(() => db.from("hospital_specialties").select("*")),
    read(() => db.from("hospital_treatments").select("*")),
    read(() => db.from("doctors").select(publicDoctorFields)),
    read(() => db.from("doctor_specialties").select("*")),
    read(() => db.from("doctor_treatments").select("*")),
    read(() => db.from("hospital_doctors").select("*")),
    read(() => db.from("packages").select("*")),
    read(() => db.from("package_inclusions").select("*")),
    read(() => db.from("package_exclusions").select("*")),
    read(() => db.from("healthcare_services").select("*")),
    read(() => db.from("price_estimates").select("*")),
    read(() => db.rpc("public_provider_package_details", {})),
    read(() => db.rpc("public_provider_hospital_details", {})),
    read(() => db.rpc("public_catalog_provenance", {})),
    read(() => db.rpc("public_reference_locations", {})),
  ]);
  const countryRows = rows(countryQuery.data, countryQuery.error, "countries");
  if (provenanceQuery.error) throw new Error("Published catalog provenance is unavailable.");
  const provenance = z.array(z.object({
    id: z.string(), origin: z.enum(["provider_published", "admin_created", "admin_reference"]),
    sourceName: z.string(), sourceUrl: z.string().nullable(),
    checkedAt: z.string().nullable(), verification: z.string(),
  })).parse(provenanceQuery.data);
  const provenanceById = new Map(provenance.map(({ id, ...source }) => [id, source]));
  if (referenceLocationsQuery.error) throw new Error("Published reference locations are unavailable.");
  const referenceLocations = z.array(z.object({hospitalId:z.string(),kind:z.string(),canonicalId:z.string().nullable(),city:z.string(),country:z.string(),recordId:z.string()})).parse(referenceLocationsQuery.data);
  const cityRows = rows(cityQuery.data, cityQuery.error, "cities");
  const specialtyRows = rows(
    specialtyQuery.data,
    specialtyQuery.error,
    "specialties",
  );
  const treatmentRows = rows(
    treatmentQuery.data,
    treatmentQuery.error,
    "treatments",
  );
  const treatmentCountryRows = rows(
    treatmentCountryQuery.data,
    treatmentCountryQuery.error,
    "treatment countries",
  );
  const hospitalRows = rows(
    hospitalQuery.data,
    hospitalQuery.error,
    "hospitals",
  );
  const hospitalSpecialtyRows = rows(
    hospitalSpecialtyQuery.data,
    hospitalSpecialtyQuery.error,
    "hospital specialties",
  );
  const hospitalTreatmentRows = rows(
    hospitalTreatmentQuery.data,
    hospitalTreatmentQuery.error,
    "hospital treatments",
  );
  const doctorRows = rows(doctorQuery.data, doctorQuery.error, "doctors");
  const doctorSpecialtyRows = rows(
    doctorSpecialtyQuery.data,
    doctorSpecialtyQuery.error,
    "doctor specialties",
  );
  const doctorTreatmentRows = rows(
    doctorTreatmentQuery.data,
    doctorTreatmentQuery.error,
    "doctor treatments",
  );
  const hospitalDoctorRows = rows(
    hospitalDoctorQuery.data,
    hospitalDoctorQuery.error,
    "hospital doctors",
  );
  const packageRows = rows(packageQuery.data, packageQuery.error, "packages");
  if (packageDetailsQuery.error)
    throw new Error("Published package details are unavailable.");
  const packageDetails = z
    .array(z.object({ id: z.string(), serviceDetails: packageServicesSchema }))
    .parse(packageDetailsQuery.data);
  const detailsById = new Map(
    packageDetails.map((item) => [item.id, item.serviceDetails]),
  );
  if (hospitalDetailsQuery.error)
    throw new Error("Published hospital details are unavailable.");
  const hospitalDetails = z
    .array(
      z.object({
        id: z.string(),
        accreditations: z.array(z.object({ name: z.string() })).nullable().transform(value => value ?? []),
        locations: z.array(z.object({ city: z.string().nullable() })).nullable().transform(value => value ?? []),
      }),
    )
    .parse(hospitalDetailsQuery.data);
  const hospitalDetailsById = new Map(
    hospitalDetails.map((item) => [item.id, item]),
  );
  const inclusionRows = rows(
    inclusionQuery.data,
    inclusionQuery.error,
    "package inclusions",
  );
  const exclusionRows = rows(
    exclusionQuery.data,
    exclusionQuery.error,
    "package exclusions",
  );
  const serviceRows = rows(
    serviceQuery.data,
    serviceQuery.error,
    "healthcare services",
  );
  const priceRows = rows(priceQuery.data, priceQuery.error, "price estimates");

  const countryById = new Map(countryRows.map((item) => [item.id, item]));
  const cityById = new Map(
    cityRows
      .filter((item) => countryById.has(item.country_id))
      .map((item) => [item.id, item]),
  );
  const specialtyById = new Map(specialtyRows.map((item) => [item.id, item]));
  const treatmentById = new Map(
    treatmentRows
      .filter((item) => specialtyById.has(item.specialty_id))
      .map((item) => [item.id, item]),
  );
  const hospitalById = new Map(
    hospitalRows
      .filter((item) => cityById.has(item.city_id))
      .map((item) => [item.id, item]),
  );

  const countries: Country[] = countryRows.map((item) => ({
    recordId: item.id,
    sourceRecordId: item.source_record_id,
    slug: item.slug,
    name: item.name,
    description: item.description,
    aliases: item.aliases,
    demo: item.source_kind === "synthetic",
    sourceKind: sourceKind(item.source_kind),
    code: item.iso_code.trim(),
    travelNote: item.travel_note,
  }));
  const estimates: PriceEstimate[] = priceRows
    .filter(
      (item) =>
        item.currency === "USD" &&
        treatmentById.has(item.treatment_id) &&
        countryById.has(item.country_id),
    )
    .map((item) => ({
      recordId: item.id,
      sourceRecordId: item.source_record_id,
      treatmentSlug: required(
        treatmentById.get(item.treatment_id),
        "price treatment",
      ).slug,
      countrySlug: required(countryById.get(item.country_id), "price country")
        .slug,
      estimatedMinUsd: item.estimated_min,
      estimatedMaxUsd: item.estimated_max,
      sourceKind: sourceKind(item.source_kind),
    }));
  const treatments: Treatment[] = [...treatmentById.values()].map((item) => {
    const treatmentPrices = priceRows.filter(
      (price) => price.treatment_id === item.id && price.currency === "USD",
    );
    return {
      recordId: item.id,
      sourceRecordId: item.source_record_id,
      slug: item.slug,
      name: item.name,
      description: item.description,
      aliases: item.aliases,
      demo: item.source_kind === "synthetic",
      sourceKind: sourceKind(item.source_kind),
      specialty: required(
        specialtyById.get(item.specialty_id),
        "treatment specialty",
      ).name,
      category: item.category,
      overview: item.overview,
      procedure: item.procedure_summary,
      indications: item.indications,
      diagnostics: item.diagnostics,
      recovery: item.recovery,
      typicalStayDays: item.typical_stay_days ?? 0,
      sampleBaseCostUsd: treatmentPrices.length
        ? Math.min(...treatmentPrices.map((price) => price.estimated_min))
        : 0,
      // Published hospital offerings also establish a canonical country link.
      // Seed-only treatment_countries rows are deliberately hidden by public RLS.
      countries: [...new Set([
        ...treatmentCountryRows
          .filter((link) => link.treatment_id === item.id && countryById.has(link.country_id))
          .map((link) => required(countryById.get(link.country_id), "treatment country").slug),
        ...hospitalTreatmentRows
          .filter((link) => link.treatment_id === item.id && hospitalById.has(link.hospital_id))
          .map((link) => cityById.get(hospitalById.get(link.hospital_id)!.city_id)?.country_id)
          .filter((id): id is string => Boolean(id && countryById.has(id)))
          .map((id) => required(countryById.get(id), "offering country").slug),
      ])],
      faqs: faqSchema.parse(item.faqs),
    };
  });
  const hospitals: Hospital[] = [...hospitalById.values()].map((item) => {
    const city = required(cityById.get(item.city_id), "hospital city");
    return {
      recordId: item.id,
      sourceRecordId: item.source_record_id,
      slug: item.slug,
      name: item.name,
      description: item.description,
      aliases: item.aliases,
      demo: item.source_kind === "synthetic",
      sourceKind: sourceKind(item.source_kind),
      city: city.name,
      ...(provenanceById.get(item.id)?.origin === "admin_reference" ? {
        locationCountries: [...new Set(referenceLocations.filter(location=>location.hospitalId===item.id).flatMap(location=>countryRows.filter(country=>country.name===location.country).map(country=>country.slug)))],
        treatmentCountries: Object.fromEntries(treatmentRows.map(treatment => [treatment.slug, referenceLocations.filter(location => location.hospitalId === item.id && location.kind === "treatment" && location.canonicalId === treatment.id).flatMap(location=>countryRows.filter(country=>country.name===location.country).map(country=>country.slug))])),
        specialtyCountries: Object.fromEntries(specialtyRows.map(specialty => [specialty.name, referenceLocations.filter(location => location.hospitalId === item.id && location.kind === "specialty" && location.canonicalId === specialty.id).flatMap(location=>countryRows.filter(country=>country.name===location.country).map(country=>country.slug))])),
        treatmentCities: Object.fromEntries(treatmentRows.map(treatment => [treatment.slug, referenceLocations.filter(location => location.hospitalId === item.id && location.kind === "treatment" && location.canonicalId === treatment.id).map(location=>location.city)])),
        specialtyCities: Object.fromEntries(specialtyRows.map(specialty => [specialty.name, referenceLocations.filter(location => location.hospitalId === item.id && location.kind === "specialty" && location.canonicalId === specialty.id).map(location=>location.city)])),
      } : {}),
      locationCities: hospitalDetailsById
        .get(item.id)
        ?.locations.map((location) => location.city)
        .filter((name): name is string => Boolean(name)),
      country: required(countryById.get(city.country_id), "hospital country")
        .slug,
      specialties: hospitalSpecialtyRows
        .filter(
          (link) =>
            link.hospital_id === item.id &&
            specialtyById.has(link.specialty_id),
        )
        .map(
          (link) =>
            required(specialtyById.get(link.specialty_id), "hospital specialty")
              .name,
        ),
      treatmentSlugs: hospitalTreatmentRows
        .filter(
          (link) =>
            link.hospital_id === item.id &&
            treatmentById.has(link.treatment_id),
        )
        .map(
          (link) =>
            required(treatmentById.get(link.treatment_id), "hospital treatment")
              .slug,
        ),
      sampleBedCount: item.bed_count ?? 0,
      sampleAccreditation: hospitalDetailsById.has(item.id)
        ? hospitalDetailsById
            .get(item.id)!
            .accreditations.map((entry) => entry.name)
            .join("; ") || "No current accreditation evidence published"
        : item.source_kind === "synthetic"
          ? "No credential listed"
          : "Provider-submitted credentials require current evidence confirmation",
      verification:
        item.source_kind === "synthetic"
          ? "Demo — unverified"
          : item.verification_status,
      infrastructure: item.infrastructure,
    };
  });
  const doctors: Doctor[] = doctorRows.map((item) => {
    const affiliation =
      hospitalDoctorRows.find(
        (link) => link.doctor_id === item.id && link.is_primary,
      ) ?? hospitalDoctorRows.find((link) => link.doctor_id === item.id);
    const hospital = affiliation
      ? hospitalById.get(affiliation.hospital_id)
      : undefined;
    const city = item.home_city_id
      ? cityById.get(item.home_city_id)
      : undefined;
    const specialtyLink =
      doctorSpecialtyRows.find(
        (link) =>
          link.doctor_id === item.id &&
          link.is_primary &&
          specialtyById.has(link.specialty_id),
      ) ??
      doctorSpecialtyRows.find(
        (link) =>
          link.doctor_id === item.id && specialtyById.has(link.specialty_id),
      );
    return {
      recordId: item.id,
      sourceRecordId: item.source_record_id,
      slug: item.slug,
      name: item.name,
      description: item.description,
      aliases: item.aliases,
      demo: item.source_kind === "synthetic",
      sourceKind: sourceKind(item.source_kind),
      specialty: specialtyLink
        ? required(
            specialtyById.get(specialtyLink.specialty_id),
            "doctor specialty",
          ).name
        : "",
      hospitalSlug: hospital?.slug ?? "",
      hospitalName: hospital?.name ?? "No current affiliation listed",
      city: city?.name ?? "",
      country: city
        ? required(countryById.get(city.country_id), "doctor country").slug
        : "",
      sampleExperienceYears: item.experience_years ?? 0,
      languages: item.languages,
      consultationMode:
        item.consultation_mode === "video" ||
        item.consultation_mode === "in-person" || item.consultation_mode === "both"
          ? item.consultation_mode
          : "not_confirmed",
      treatmentSlugs: doctorTreatmentRows
        .filter(
          (link) =>
            link.doctor_id === item.id && treatmentById.has(link.treatment_id),
        )
        .map(
          (link) =>
            required(treatmentById.get(link.treatment_id), "doctor treatment")
              .slug,
        ),
      verification:
        item.source_kind === "synthetic"
          ? "Demo — unverified"
          : item.verification_status,
      qualifications: [item.qualifications_note.trim()].filter(Boolean),
    };
  });
  const packages: Package[] = packageRows
    .filter(
      (item) =>
        treatmentById.has(item.treatment_id) &&
        countryById.has(item.country_id) &&
        (!item.hospital_id || hospitalById.has(item.hospital_id)),
    )
    .map((item) => ({
      recordId: item.id,
      sourceRecordId: item.source_record_id,
      slug: item.slug,
      name: item.name,
      description: item.description,
      aliases: item.aliases,
      demo: item.source_kind === "synthetic",
      sourceKind: sourceKind(item.source_kind),
      treatmentSlug: required(
        treatmentById.get(item.treatment_id),
        "package treatment",
      ).slug,
      city: referenceLocations.find(location => location.kind === "package" && location.canonicalId === item.id)?.city,
      hospitalSlug: item.hospital_id
        ? required(hospitalById.get(item.hospital_id), "package hospital").slug
        : "",
      hospitalName: item.hospital_id
        ? required(hospitalById.get(item.hospital_id), "package hospital").name
        : "Provider to be confirmed",
      country: required(countryById.get(item.country_id), "package country")
        .slug,
      durationDays: item.duration_days,
      serviceDetails: detailsById.get(item.id),
      currency: item.currency.trim(),
      listedPrice: item.estimated_min,
      priceType: item.price_type,
      samplePriceUsd: item.currency.trim() === "USD" ? item.estimated_min : 0,
      inclusions: inclusionRows
        .filter((link) => link.package_id === item.id)
        .sort((a, b) => a.position - b.position)
        .map((link) => link.description),
      exclusions: exclusionRows
        .filter((link) => link.package_id === item.id)
        .sort((a, b) => a.position - b.position)
        .map((link) => link.description),
      benefits: item.benefits,
    }));
  const services: Service[] = serviceRows.map((item) => ({
    recordId: item.id,
    sourceRecordId: item.source_record_id,
    slug: item.slug,
    name: item.name,
    description: item.description,
    aliases: item.aliases,
    demo: item.source_kind === "synthetic",
    sourceKind: sourceKind(item.source_kind),
    href: item.href,
    category:
      item.category === "plan" || item.category === "recover"
        ? item.category
        : "treat",
    steps: item.steps,
  }));
  return {
    treatments: treatments.map(item => ({ ...item, provenance: provenanceById.get(item.recordId) })),
    hospitals: hospitals.map(item => ({ ...item, provenance: provenanceById.get(item.recordId) })),
    doctors: doctors.map(item => ({ ...item, provenance: provenanceById.get(item.recordId) })),
    packages: packages.map(item => ({ ...item, provenance: provenanceById.get(item.recordId) })),
    countries: countries.map(item => ({ ...item, provenance: provenanceById.get(item.recordId) })),
    services: services.map(item => ({ ...item, provenance: provenanceById.get(item.recordId) })),
    estimates,
  };
});

export const catalogRepository: CatalogRepository = {
  async loadSnapshot() {
    return loadSnapshot();
  },
  async listTreatments() {
    return (await loadSnapshot()).treatments;
  },
  async listHospitals() {
    return (await loadSnapshot()).hospitals;
  },
  async listDoctors() {
    return (await loadSnapshot()).doctors;
  },
  async listPackages() {
    return (await loadSnapshot()).packages;
  },
  async listCountries() {
    return (await loadSnapshot()).countries;
  },
  async listServices() {
    return (await loadSnapshot()).services;
  },
  async listPriceEstimates() {
    return (await loadSnapshot()).estimates;
  },
  async findCandidateSlugs(parsed: ParsedQuery): Promise<CatalogCandidates> {
    const { data, error } = await getPublicSupabaseClient().rpc(
      "search_catalog_candidates",
      {
        p_terms: parsed.tokens.join(" "),
        p_treatment_slug: parsed.entities.procedure ?? null,
        p_specialty: parsed.entities.specialty ?? null,
        p_countries: [...parsed.entities.countries],
        p_city: parsed.entities.city ?? null,
      },
    );
    const candidates = Object.fromEntries(
      kinds.map((kind) => [kind, new Set<string>()]),
    ) as Record<CatalogKind, Set<string>>;
    for (const match of rows(data, error, "catalog search")) {
      if (kinds.includes(match.kind as CatalogKind))
        candidates[match.kind as CatalogKind].add(match.slug);
    }
    if (parsed.entities.city) {
      for (const hospital of (await loadSnapshot()).hospitals) {
        if (
          hospital.locationCities?.some(
            (city) => normalize(city) === normalize(parsed.entities.city!),
          )
        )
          candidates.hospitals.add(hospital.slug);
      }
    }
    return candidates;
  },
};

export async function getTreatmentBySlug(slug: string) {
  return (await catalogRepository.listTreatments()).find(
    (item) => item.slug === slug,
  );
}
export async function getHospitalBySlug(slug: string) {
  return (await catalogRepository.listHospitals()).find(
    (item) => item.slug === slug,
  );
}
export async function getDoctorBySlug(slug: string) {
  return (await catalogRepository.listDoctors()).find(
    (item) => item.slug === slug,
  );
}
export async function getPackageBySlug(slug: string) {
  return (await catalogRepository.listPackages()).find(
    (item) => item.slug === slug,
  );
}
export async function getServiceBySlug(slug: string) {
  return (await catalogRepository.listServices()).find(
    (item) => item.slug === slug,
  );
}
