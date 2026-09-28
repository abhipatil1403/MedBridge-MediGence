export type CatalogKind = "treatments" | "hospitals" | "doctors" | "packages" | "countries" | "services";
export type ConsultationMode = "video" | "in-person" | "both";

export interface DemoRecord {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly aliases: readonly string[];
  readonly demo: true;
}

export interface Faq {
  readonly question: string;
  readonly answer: string;
}

export interface Treatment extends DemoRecord {
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

export interface Hospital extends DemoRecord {
  readonly city: string;
  readonly country: string;
  readonly specialties: readonly string[];
  readonly treatmentSlugs: readonly string[];
  readonly sampleBedCount: number;
  readonly sampleAccreditation: "Sample credential listed" | "No sample credential";
  readonly verification: "Demo — unverified";
  readonly infrastructure: readonly string[];
}

export interface Doctor extends DemoRecord {
  readonly specialty: string;
  readonly hospitalSlug: string;
  readonly hospitalName: string;
  readonly city: string;
  readonly country: string;
  readonly sampleExperienceYears: number;
  readonly languages: readonly string[];
  readonly consultationMode: ConsultationMode;
  readonly treatmentSlugs: readonly string[];
  readonly verification: "Demo — unverified";
  readonly qualifications: readonly string[];
}

export interface Country extends DemoRecord {
  readonly code: string;
  readonly travelNote: string;
  readonly sampleCostMultiplier: number;
}

export interface Package extends DemoRecord {
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

export interface Service extends DemoRecord {
  readonly href: string;
  readonly category: "plan" | "treat" | "recover";
  readonly steps: readonly string[];
}

export interface CatalogRepository {
  listTreatments(): Promise<readonly Treatment[]>;
  listHospitals(): Promise<readonly Hospital[]>;
  listDoctors(): Promise<readonly Doctor[]>;
  listPackages(): Promise<readonly Package[]>;
  listCountries(): Promise<readonly Country[]>;
  listServices(): Promise<readonly Service[]>;
}
