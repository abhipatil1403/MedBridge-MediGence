import { catalogRepository } from "./repository";

export async function getTreatmentDetail(slug: string) {
  const [treatments, hospitals, doctors, packages, countries] = await Promise.all([
    catalogRepository.listTreatments(), catalogRepository.listHospitals(), catalogRepository.listDoctors(),
    catalogRepository.listPackages(), catalogRepository.listCountries(),
  ]);
  const treatment = treatments.find((item) => item.slug === slug);
  if (!treatment) return undefined;
  return {
    treatment,
    hospitals: hospitals.filter((item) => item.treatmentSlugs.includes(slug)).slice(0, 5),
    doctors: doctors.filter((item) => item.treatmentSlugs.includes(slug)).slice(0, 5),
    packages: packages.filter((item) => item.treatmentSlug === slug),
    countries: countries.filter((item) => treatment.countries.includes(item.slug)),
    related: treatments.filter((item) => item.specialty === treatment.specialty && item.slug !== slug).slice(0, 4),
  };
}

export async function getHospitalDetail(slug: string) {
  const [hospitals, treatments, doctors, packages, countries] = await Promise.all([
    catalogRepository.listHospitals(), catalogRepository.listTreatments(), catalogRepository.listDoctors(),
    catalogRepository.listPackages(), catalogRepository.listCountries(),
  ]);
  const hospital = hospitals.find((item) => item.slug === slug);
  if (!hospital) return undefined;
  return {
    hospital,
    country: countries.find((item) => item.slug === hospital.country),
    treatments: treatments.filter((item) => hospital.treatmentSlugs.includes(item.slug)),
    doctors: doctors.filter((item) => item.hospitalSlug === slug),
    packages: packages.filter((item) => item.hospitalSlug === slug),
    related: hospitals.filter((item) => item.slug !== slug && item.specialties.some(s => hospital.specialties.includes(s))).slice(0, 3),
  };
}

export async function getDoctorDetail(slug: string) {
  const [doctors, hospitals, treatments, countries] = await Promise.all([
    catalogRepository.listDoctors(), catalogRepository.listHospitals(),
    catalogRepository.listTreatments(), catalogRepository.listCountries(),
  ]);
  const doctor = doctors.find((item) => item.slug === slug);
  if (!doctor) return undefined;
  return {
    doctor,
    hospital: hospitals.find((item) => item.slug === doctor.hospitalSlug),
    country: countries.find((item) => item.slug === doctor.country),
    treatments: treatments.filter((item) => doctor.treatmentSlugs.includes(item.slug)),
    related: doctors.filter(item=>item.slug!==slug&&item.specialty===doctor.specialty).slice(0,3),
  };
}

export async function getPackageDetail(slug: string) {
  const [packages, hospitals, treatments, countries] = await Promise.all([
    catalogRepository.listPackages(), catalogRepository.listHospitals(),
    catalogRepository.listTreatments(), catalogRepository.listCountries(),
  ]);
  const carePackage = packages.find((item) => item.slug === slug);
  if (!carePackage) return undefined;
  return {
    carePackage,
    hospital: hospitals.find((item) => item.slug === carePackage.hospitalSlug),
    treatment: treatments.find((item) => item.slug === carePackage.treatmentSlug),
    country: countries.find((item) => item.slug === carePackage.country),
  };
}
