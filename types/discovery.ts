import type { CatalogKind, Country, Doctor, Hospital, Package, Service, Treatment } from "@/types/catalog";

export type DiscoveryIntent = "treatment" | "hospital" | "doctor" | "comparison" | "second-opinion" | "consultation" | "package" | "travel" | "recovery" | "general-discovery";
export type SortOption = "relevance" | "name" | "experience" | "price" | "location";
export type ResultType = CatalogKind | "all";

export interface ParsedQuery {
  query: string;
  intent: DiscoveryIntent;
  tokens: readonly string[];
  entities: {
    procedure?: string;
    specialty?: string;
    condition?: string;
    country?: string;
    countries: readonly string[];
    city?: string;
    service?: string;
  };
}

export interface DiscoveryFilters {
  q: string;
  type: ResultType;
  specialty?: string;
  country?: string;
  city?: string;
  accreditation?: "sample" | "none";
  hospital?: string;
  mode?: "video" | "in-person";
  treatment?: string;
  budget?: number;
  sort: SortOption;
}

export interface Matched<T> {
  item: T;
  score: number;
  reason: string;
}

export interface DiscoveryResults {
  understanding: ParsedQuery;
  filters: DiscoveryFilters;
  sections: {
    treatments: Matched<Treatment>[];
    hospitals: Matched<Hospital>[];
    doctors: Matched<Doctor>[];
    packages: Matched<Package>[];
    countries: Matched<Country>[];
    services: Matched<Service>[];
  };
  total: number;
}

export interface SearchSuggestion {
  label: string;
  query: string;
  type: ResultType;
  kind: "treatment" | "hospital" | "doctor" | "country" | "service" | "guided";
}
