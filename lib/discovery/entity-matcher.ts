import type { Country, Doctor, Hospital, Service, Treatment } from "@/types/catalog";
import { includesPhrase, normalize } from "./normalize";

export interface MatchCatalog {
  treatments: readonly Treatment[];
  hospitals: readonly Hospital[];
  doctors: readonly Doctor[];
  countries: readonly Country[];
  services: readonly Service[];
}

const specialtyAliases: Record<string, readonly string[]> = {
  Cardiology: ["cardiologist", "cardiologists", "heart doctor", "heart specialist", "cardiac doctor", "heart surgeon", "cardiac"],
  Orthopedics: ["orthopedic", "orthopaedic", "joint doctor", "bone doctor", "orthopedist"],
  Oncology: ["oncologist", "oncologists", "cancer doctor", "cancer doctors", "cancer specialist"],
  Neurology: ["neurologist", "brain doctor", "neurosurgeon", "spine specialist"],
  Nephrology: ["kidney doctor", "nephrologist"],
  Pediatrics: ["children's doctor", "childrens doctor", "pediatrician"],
  Gynecology: ["women's doctor", "womens doctor", "gynecologist"],
  Dermatology: ["skin doctor", "dermatologist"],
  Ophthalmology: ["eye doctor", "ophthalmologist"],
  Transplant: ["transplant specialist"],
  Fertility: ["fertility specialist", "reproductive specialist"],
  Rehabilitation: ["physiotherapist", "physical therapist", "rehab specialist"],
};

const cityAliases: Record<string, readonly string[]> = {
  Mumbai: ['mumbai'], Pune: ['pune'], 'New Delhi': ['new delhi', 'delhi'], Bengaluru: ['bengaluru', 'bangalore'],
};

function bestNameMatch<T extends { slug: string; name: string; aliases: readonly string[] }>(query: string, items: readonly T[]): T | undefined {
  return items.flatMap((item) => [item.name, ...item.aliases].map((phrase) => ({ item, phrase })))
    .filter(({ phrase }) => includesPhrase(query, phrase))
    .sort((a, b) => b.phrase.length - a.phrase.length)[0]?.item;
}

export const EntityMatcher = {
  match(query: string, catalog: MatchCatalog) {
    const countries = catalog.countries.filter((country) => [country.name, ...country.aliases].some((name) => includesPhrase(query, name))).map((country) => country.slug);
    const specialty = Object.entries(specialtyAliases).find(([, aliases]) => aliases.some((alias) => includesPhrase(query, alias)))?.[0]
      ?? [...new Set(catalog.treatments.map((item) => item.specialty))].find((name) => includesPhrase(query, name));
    const city = Object.entries(cityAliases).find(([, aliases]) => aliases.some((alias) => includesPhrase(query, alias)))?.[0]
      ?? [...new Set([...catalog.hospitals.map((hospital) => hospital.city), ...catalog.doctors.map((doctor) => doctor.city)])]
        .find((name) => includesPhrase(query, name));
    const treatment = bestNameMatch(query, catalog.treatments);
    const service = bestNameMatch(query, catalog.services);
    const normalized = normalize(query);
    const country = countries[0] ?? (city && ['Mumbai', 'Pune', 'New Delhi', 'Bengaluru'].includes(city) ? 'india' : undefined);
    return {
      procedure: treatment?.slug,
      specialty: specialty ?? treatment?.specialty,
      condition: /\bcancer\b/.test(normalized) ? "cancer" : /\bstroke\b/.test(normalized) ? "stroke" : undefined,
      country,
      countries: country ? [country, ...countries.filter((item) => item !== country)] : countries,
      city,
      service: service?.slug,
    };
  },
};
