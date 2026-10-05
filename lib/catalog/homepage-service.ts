import { catalogRepository } from "./repository";

const featuredTreatmentSlugs = [
  "knee-replacement", "hip-replacement", "cabg", "kidney-transplant",
  "bone-marrow-transplant", "brain-and-spine-surgery", "cancer-treatment", "fertility-treatment",
];

export async function getHomepageCatalog() {
  const [treatments, hospitals, doctors, countries,packages] = await Promise.all([
    catalogRepository.listTreatments(), catalogRepository.listHospitals(),
    catalogRepository.listDoctors(), catalogRepository.listCountries(),catalogRepository.listPackages(),
  ]);
  return {
    treatments: [...featuredTreatmentSlugs.flatMap((slug) => treatments.filter((item) => item.slug === slug)),...treatments.filter(item=>!featuredTreatmentSlugs.includes(item.slug))].slice(0,8),
    hospitals: hospitals.slice(0, 3),
    doctors: doctors.slice(0, 4),
    countries,
    packages:packages.slice(0,3),
  };
}
