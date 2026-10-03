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
  locations(query: string, catalog: MatchCatalog) {
    const text = normalize(query);
    const cities = [...new Set([...Object.keys(cityAliases), ...catalog.hospitals.flatMap((item) => [item.city, ...(item.locationCities ?? [])]), ...catalog.doctors.map((item) => item.city)])];
    const matches = [
      ...cities.map((city) => ({ type: 'city' as const, value: city, label: city, aliases: cityAliases[city] ?? [city] })),
      ...catalog.countries.map((country) => ({ type: 'country' as const, value: country.slug, label: country.name, aliases: [country.name, ...country.aliases] })),
    ].flatMap(({ aliases, ...option }) => {
      const positions = aliases.map((alias) => ` ${text} `.indexOf(` ${normalize(alias)} `)).filter((index) => index >= 0);
      return positions.length ? [{ ...option, position: Math.min(...positions) }] : [];
    }).sort((a, b) => a.position - b.position);
    return matches.map(({ type, value, label }) => ({ type, value, label }));
  },
  match(query: string, catalog: MatchCatalog) {
    const countries = catalog.countries.filter((country) => [country.name, ...country.aliases].some((name) => includesPhrase(query, name))).map((country) => country.slug);
    const specialty = Object.entries(specialtyAliases).find(([name, aliases]) => includesPhrase(query, name) || aliases.some((alias) => includesPhrase(query, alias)))?.[0]
      ?? [...new Set(catalog.treatments.map((item) => item.specialty))].find((name) => includesPhrase(query, name));
    const city = Object.entries(cityAliases).find(([, aliases]) => aliases.some((alias) => includesPhrase(query, alias)))?.[0]
      ?? [...new Set([...catalog.hospitals.flatMap((hospital) => [hospital.city, ...(hospital.locationCities ?? [])]), ...catalog.doctors.map((doctor) => doctor.city)])]
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
