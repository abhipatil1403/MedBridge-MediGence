import { demoCountries, demoDoctors, demoHospitals, demoPackages, demoServices, demoTreatments } from "@/data/demo-catalog";
import type { CatalogRepository, Country, Doctor, Hospital, Package, Service, Treatment } from "@/types/catalog";

/** Swap this adapter for a Supabase-backed repository without changing callers. */
export const catalogRepository: CatalogRepository = {
  async listTreatments(): Promise<readonly Treatment[]> { return demoTreatments; },
  async listHospitals(): Promise<readonly Hospital[]> { return demoHospitals; },
  async listDoctors(): Promise<readonly Doctor[]> { return demoDoctors; },
  async listPackages(): Promise<readonly Package[]> { return demoPackages; },
  async listCountries(): Promise<readonly Country[]> { return demoCountries; },
  async listServices(): Promise<readonly Service[]> { return demoServices; },
};

export async function getTreatmentBySlug(slug: string) {
  return (await catalogRepository.listTreatments()).find((item) => item.slug === slug);
}

export async function getHospitalBySlug(slug: string) {
  return (await catalogRepository.listHospitals()).find((item) => item.slug === slug);
}

export async function getDoctorBySlug(slug: string) {
  return (await catalogRepository.listDoctors()).find((item) => item.slug === slug);
}

export async function getPackageBySlug(slug: string) {
  return (await catalogRepository.listPackages()).find((item) => item.slug === slug);
}

export async function getServiceBySlug(slug: string) {
  return (await catalogRepository.listServices()).find((item) => item.slug === slug);
}
