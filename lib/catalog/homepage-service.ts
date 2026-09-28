import { catalogRepository } from "./repository";

const featuredTreatmentSlugs = [
  "knee-replacement", "hip-replacement", "cabg", "kidney-transplant",
  "bone-marrow-transplant", "brain-and-spine-surgery", "cancer-treatment", "fertility-treatment",
];

export async function getHomepageCatalog() {
  const [treatments, hospitals, doctors, countries] = await Promise.all([
    catalogRepository.listTreatments(), catalogRepository.listHospitals(),
    catalogRepository.listDoctors(), catalogRepository.listCountries(),
  ]);
  return {
    treatments: featuredTreatmentSlugs.flatMap((slug) => treatments.filter((item) => item.slug === slug)),
    hospitals: hospitals.slice(0, 3),
    doctors: doctors.slice(0, 4),
    countries,
  };
}
