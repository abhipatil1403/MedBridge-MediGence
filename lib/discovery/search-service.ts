import { catalogRepository } from "@/lib/catalog/repository";
import type { CatalogKind, CatalogRepository, Country, Doctor, Hospital, Package, Service, Treatment } from "@/types/catalog";
import type { DiscoveryFilters, DiscoveryResults, Matched, ParsedQuery, SearchSuggestion } from "@/types/discovery";
import { QueryParser } from "./query-parser";
import { SearchRankingService } from "./search-ranking-service";
import { normalize } from "./normalize";

interface CatalogSnapshot {
  treatments: readonly Treatment[];
  hospitals: readonly Hospital[];
  doctors: readonly Doctor[];
  packages: readonly Package[];
  countries: readonly Country[];
  services: readonly Service[];
}

async function loadCatalog(repository: CatalogRepository): Promise<CatalogSnapshot> {
  const [treatments, hospitals, doctors, packages, countries, services] = await Promise.all([
    repository.listTreatments(), repository.listHospitals(), repository.listDoctors(),
    repository.listPackages(), repository.listCountries(), repository.listServices(),
  ]);
  return { treatments, hospitals, doctors, packages, countries, services };
}

function matched<T extends { name: string; slug: string; aliases: readonly string[] }>(
  kind: "treatments" | "hospitals" | "doctors" | "packages" | "countries" | "services",
  items: readonly T[], parsed: ParsedQuery,
  details: (item: T) => { specialty?: string; country?: string; treatmentSlugs?: readonly string[]; searchText?: string } = () => ({}),
): Matched<T>[] {
  return items.map((item) => {
    const itemDetails = details(item);
    return { item, score: SearchRankingService.score(kind, item, parsed, itemDetails), reason: SearchRankingService.reason(kind, parsed, itemDetails) };
  }).filter((result) => result.score > 0);
}

function resolvedCountry(parsed: ParsedQuery, filters: DiscoveryFilters): string | undefined {
  return filters.country || (parsed.entities.countries.length === 1 ? parsed.entities.countries[0] : undefined);
}

export function searchTreatments(catalog: CatalogSnapshot, parsed: ParsedQuery, filters: DiscoveryFilters): Matched<Treatment>[] {
  const country = resolvedCountry(parsed, filters);
  const results = catalog.treatments.filter((item) =>
    (!filters.specialty || item.specialty === filters.specialty) &&
    (!country || item.countries.includes(country)) &&
    (!filters.treatment || item.slug === filters.treatment),
  );
  return SearchRankingService.sort(matched("treatments", results, parsed, (item) => ({ specialty: item.specialty, treatmentSlugs: [item.slug], searchText: item.category })), filters.sort, (item, key) => key === "price" ? item.sampleBaseCostUsd : undefined);
}

export function searchHospitals(catalog: CatalogSnapshot, parsed: ParsedQuery, filters: DiscoveryFilters): Matched<Hospital>[] {
  const country = resolvedCountry(parsed, filters);
  const city = filters.city || parsed.entities.city;
  const results = catalog.hospitals.filter((item) =>
    (!country || item.country === country) && (!city || normalize(item.city) === normalize(city)) &&
    (!filters.specialty || item.specialties.includes(filters.specialty)) &&
    (!filters.accreditation || (filters.accreditation === "sample" ? item.sampleAccreditation === "Sample credential listed" : item.sampleAccreditation === "No sample credential")) &&
    (!filters.treatment || item.treatmentSlugs.includes(filters.treatment)),
  );
  return SearchRankingService.sort(matched("hospitals", results, parsed, (item) => ({
    country: item.country, treatmentSlugs: item.treatmentSlugs, specialty: item.specialties.includes(parsed.entities.specialty ?? "") ? parsed.entities.specialty : undefined,
    searchText: item.treatmentSlugs.map((slug) => catalog.treatments.find((treatment) => treatment.slug === slug)?.name ?? "").join(" "),
  })), filters.sort, (item, key) => key === "location" ? `${item.country} ${item.city}` : undefined);
}

export function searchDoctors(catalog: CatalogSnapshot, parsed: ParsedQuery, filters: DiscoveryFilters): Matched<Doctor>[] {
  const country = resolvedCountry(parsed, filters);
  const results = catalog.doctors.filter((item) =>
    (!country || item.country === country) && (!filters.specialty || item.specialty === filters.specialty) &&
    (!filters.hospital || item.hospitalSlug === filters.hospital) &&
    (!filters.mode || item.consultationMode === "both" || item.consultationMode === filters.mode) &&
    (!filters.treatment || item.treatmentSlugs.includes(filters.treatment)),
  );
  return SearchRankingService.sort(matched("doctors", results, parsed, (item) => ({
    country: item.country, specialty: item.specialty, treatmentSlugs: item.treatmentSlugs,
    searchText: item.treatmentSlugs.map((slug) => catalog.treatments.find((treatment) => treatment.slug === slug)?.name ?? "").join(" "),
  })), filters.sort, (item, key) => key === "experience" ? item.sampleExperienceYears : key === "location" ? `${item.country} ${item.city}` : undefined);
}

export function searchPackages(catalog: CatalogSnapshot, parsed: ParsedQuery, filters: DiscoveryFilters): Matched<Package>[] {
  const country = resolvedCountry(parsed, filters);
  const results = catalog.packages.filter((item) =>
    (!country || item.country === country) && (!filters.treatment || item.treatmentSlug === filters.treatment) &&
    (!filters.budget || item.samplePriceUsd <= filters.budget),
  );
  return SearchRankingService.sort(matched("packages", results, parsed, (item) => ({
    country: item.country, treatmentSlugs: [item.treatmentSlug],
    searchText: catalog.treatments.find((treatment) => treatment.slug === item.treatmentSlug)?.name,
  })), filters.sort, (item, key) => key === "price" ? item.samplePriceUsd : undefined);
}

export function searchCountries(catalog: CatalogSnapshot, parsed: ParsedQuery, filters: DiscoveryFilters): Matched<Country>[] {
  const results = catalog.countries.filter((item) => !filters.country || item.slug === filters.country);
  return SearchRankingService.sort(matched("countries", results, parsed, (item) => ({ country: item.slug })), filters.sort, (item, key) => key === "location" ? item.name : undefined);
}

export function searchServices(catalog: CatalogSnapshot, parsed: ParsedQuery, filters: DiscoveryFilters): Matched<Service>[] {
  return SearchRankingService.sort(matched("services", catalog.services, parsed), filters.sort, () => undefined);
}

function sectionForIntent(intent: ParsedQuery["intent"]): keyof DiscoveryResults["sections"] | null {
  return ({ treatment: "treatments", hospital: "hospitals", doctor: "doctors", comparison: "countries", "second-opinion": "services", consultation: "services", package: "packages", travel: "services", recovery: "services", "general-discovery": null } satisfies Record<ParsedQuery["intent"], keyof DiscoveryResults["sections"] | null>)[intent];
}

export class SearchService {
  constructor(private readonly repository: CatalogRepository = catalogRepository) {}

  async search(filters: DiscoveryFilters): Promise<DiscoveryResults> {
    const catalog = await loadCatalog(this.repository);
    const understanding = QueryParser.parse(filters.q, catalog);
    const shouldQueryDatabase = Boolean(understanding.tokens.length || understanding.entities.procedure || understanding.entities.specialty || understanding.entities.countries.length || understanding.entities.city || understanding.entities.service);
    const candidates = shouldQueryDatabase ? await this.repository.findCandidateSlugs(understanding) : undefined;
    const fromDatabase = <T extends { slug: string }>(kind: CatalogKind, results: Matched<T>[]): Matched<T>[] =>
      candidates ? results.filter(({ item }) => candidates[kind].has(item.slug)) : results;
    const sections = {
      treatments: filters.type === "all" || filters.type === "treatments" ? fromDatabase("treatments", searchTreatments(catalog, understanding, filters)) : [],
      hospitals: filters.type === "all" || filters.type === "hospitals" ? fromDatabase("hospitals", searchHospitals(catalog, understanding, filters)) : [],
      doctors: filters.type === "all" || filters.type === "doctors" ? fromDatabase("doctors", searchDoctors(catalog, understanding, filters)) : [],
      packages: filters.type === "all" || filters.type === "packages" ? fromDatabase("packages", searchPackages(catalog, understanding, filters)) : [],
      countries: filters.type === "all" || filters.type === "countries" ? fromDatabase("countries", searchCountries(catalog, understanding, filters)) : [],
      services: filters.type === "all" || filters.type === "services" ? fromDatabase("services", searchServices(catalog, understanding, filters)) : [],
    };
    return { understanding, filters, sections, total: Object.values(sections).reduce((sum, results) => sum + results.length, 0) };
  }

  async suggestions(query: string): Promise<SearchSuggestion[]> {
    const text = normalize(query).slice(0, 80);
    if (text.length < 2) return [];
    const catalog = await loadCatalog(this.repository);
    const entities: SearchSuggestion[] = [
      ...catalog.treatments.map((item) => ({ label: item.name, query: item.name, type: "treatments" as const, kind: "treatment" as const, aliases: item.aliases })),
      ...catalog.services.map((item) => ({ label: item.name, query: item.name, type: "services" as const, kind: "service" as const, aliases: item.aliases })),
      ...catalog.countries.map((item) => ({ label: item.name, query: `Hospitals in ${item.name}`, type: "hospitals" as const, kind: "country" as const, aliases: item.aliases })),
    ].filter((item) => normalize(item.label).includes(text) || item.aliases.some((alias) => normalize(alias).includes(text)))
      .sort((a, b) => Number(normalize(b.label).startsWith(text)) - Number(normalize(a.label).startsWith(text)) || a.label.localeCompare(b.label))
      .slice(0, 5).map((item) => ({ label: item.label, query: item.query, type: item.type, kind: item.kind }));
    const parsed = QueryParser.parse(query, catalog);
    const suggestedTreatment = catalog.treatments.find((item) => item.slug === parsed.entities.procedure)
      ?? catalog.treatments.find((item) => normalize(item.name).includes(text) || item.aliases.some((alias) => normalize(alias).includes(text)));
    if (suggestedTreatment) {
      const treatment = suggestedTreatment;
      if (treatment) entities.push(
        { label: `Hospitals for ${treatment.name}`, query: `hospitals for ${treatment.name}`, type: "hospitals", kind: "guided" },
        { label: `Doctors for ${treatment.name}`, query: `doctors for ${treatment.name}`, type: "doctors", kind: "guided" },
      );
    }
    if (entities.length === 0) entities.push({ label: `Search for “${query.trim()}”`, query: query.trim(), type: "all", kind: "guided" });
    return entities.slice(0, 6);
  }

  async facets() {
    const catalog = await loadCatalog(this.repository);
    return {
      specialties: [...new Set(catalog.treatments.map((item) => item.specialty))].sort(),
      countries: catalog.countries.map(({ slug, name }) => ({ slug, name })),
      cities: [...new Set(catalog.hospitals.map((item) => item.city))].sort(),
      hospitals: catalog.hospitals.map(({ slug, name }) => ({ slug, name })),
      treatments: catalog.treatments.map(({ slug, name }) => ({ slug, name })),
    };
  }

  primarySection(intent: ParsedQuery["intent"]): keyof DiscoveryResults["sections"] | null {
    return sectionForIntent(intent);
  }
}

export const searchService = new SearchService();
