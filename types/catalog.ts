export type CatalogKind = "treatments" | "hospitals" | "doctors" | "packages" | "countries" | "services";
export type ConsultationMode = "video" | "in-person" | "both";

export interface CatalogRecord {
  readonly recordId: string;
  readonly sourceRecordId: string | null;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly aliases: readonly string[];
  readonly demo: boolean;
  readonly sourceKind: "synthetic" | "external" | "first_party";
}

export interface Faq {
  readonly question: string;
  readonly answer: string;
}

export interface Treatment extends CatalogRecord {
  readonly specialty: string;
  readonly category: string;
  readonly overview: string;
  readonly procedure: string;
  readonly indications: string;
  readonly diagnostics: string;
  readonly recovery: string;
  readonly typicalStayDays: number;
  readonly sampleBaseCostUsd: number;
  readonly countries: readonly string[];
  readonly faqs: readonly Faq[];
}

export interface Hospital extends CatalogRecord {
  readonly city: string;
  readonly country: string;
  readonly specialties: readonly string[];
  readonly treatmentSlugs: readonly string[];
  readonly sampleBedCount: number;
  readonly sampleAccreditation: string;
  readonly verification: string;
  readonly infrastructure: readonly string[];
}

export interface Doctor extends CatalogRecord {
  readonly specialty: string;
  readonly hospitalSlug: string;
  readonly hospitalName: string;
  readonly city: string;
  readonly country: string;
  readonly sampleExperienceYears: number;
  readonly languages: readonly string[];
  readonly consultationMode: ConsultationMode;
  readonly treatmentSlugs: readonly string[];
  readonly verification: string;
  readonly qualifications: readonly string[];
}

export interface Country extends CatalogRecord {
  readonly code: string;
  readonly travelNote: string;
}

export interface Package extends CatalogRecord {
  readonly treatmentSlug: string;
  readonly hospitalSlug: string;
  readonly hospitalName: string;
  readonly country: string;
  readonly durationDays: number;
  readonly samplePriceUsd: number;
  readonly inclusions: readonly string[];
  readonly exclusions: readonly string[];
  readonly benefits: readonly string[];
}

export interface Service extends CatalogRecord {
  readonly href: string;
  readonly category: "plan" | "treat" | "recover";
  readonly steps: readonly string[];
}

export interface PriceEstimate {
  readonly recordId: string;
  readonly sourceRecordId: string | null;
  readonly treatmentSlug: string;
  readonly countrySlug: string;
  readonly estimatedMinUsd: number;
  readonly estimatedMaxUsd: number;
  readonly sourceKind: "synthetic" | "external" | "first_party";
}

export type CatalogCandidates = Readonly<Record<CatalogKind, ReadonlySet<string>>>;

export interface CatalogSnapshot {
  treatments: readonly Treatment[];
  hospitals: readonly Hospital[];
  doctors: readonly Doctor[];
  packages: readonly Package[];
  countries: readonly Country[];
  services: readonly Service[];
  estimates: readonly PriceEstimate[];
}

export interface CatalogRepository {
  loadSnapshot?(): Promise<CatalogSnapshot>;
  listTreatments(): Promise<readonly Treatment[]>;
  listHospitals(): Promise<readonly Hospital[]>;
  listDoctors(): Promise<readonly Doctor[]>;
  listPackages(): Promise<readonly Package[]>;
  listCountries(): Promise<readonly Country[]>;
  listServices(): Promise<readonly Service[]>;
  listPriceEstimates(): Promise<readonly PriceEstimate[]>;
  findCandidateSlugs(parsed: import("@/types/discovery").ParsedQuery): Promise<CatalogCandidates>;
}
