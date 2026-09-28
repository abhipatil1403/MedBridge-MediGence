import { catalogRepository } from "./repository";
import type { Country } from "@/types/catalog";

export async function getComparison(procedureSlug: string, firstSlug: string, secondSlug: string) {
  const [treatments, countries, hospitals, doctors, packages, estimates] = await Promise.all([
    catalogRepository.listTreatments(), catalogRepository.listCountries(), catalogRepository.listHospitals(),
    catalogRepository.listDoctors(), catalogRepository.listPackages(), catalogRepository.listPriceEstimates(),
  ]);
  const treatment = treatments.find((item) => item.slug === procedureSlug);
  const first = countries.find((item) => item.slug === firstSlug);
  const second = countries.find((item) => item.slug === secondSlug);
  if (!treatment || !first || !second || first.slug === second.slug) return undefined;
  const selectedTreatment = treatment;
  function side(country: Country) {
    const estimate = estimates.find((item) => item.treatmentSlug === procedureSlug && item.countrySlug === country.slug);
    return {
      country,
      sampleCostUsd: estimate?.estimatedMinUsd,
      sampleCostMaxUsd: estimate?.estimatedMaxUsd,
      hospitals: hospitals.filter((item) => item.country === country.slug && item.treatmentSlugs.includes(procedureSlug)),
      doctors: doctors.filter((item) => item.country === country.slug && item.treatmentSlugs.includes(procedureSlug)),
      packages: packages.filter((item) => item.country === country.slug && item.treatmentSlug === procedureSlug),
      sampleStayDays: estimate ? selectedTreatment.typicalStayDays : undefined,
    };
  }
  return { treatment, first: side(first), second: side(second) };
}
