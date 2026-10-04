import type { Hospital } from "@/types/catalog";
import { normalize } from "@/lib/discovery/normalize";
export function hospitalCities(hospital: Hospital, treatment?: string, specialty?: string): readonly string[] {
  if (hospital.provenance?.origin === "admin_reference") {
    if (treatment) return hospital.treatmentCities?.[treatment] ?? [];
    if (specialty) return hospital.specialtyCities?.[specialty] ?? [];
  }
  return [hospital.city, ...(hospital.locationCities ?? [])];
}
export function hospitalMatchesCity(hospital: Hospital, city?: string, treatment?: string, specialty?: string) {
  return !city || hospitalCities(hospital, treatment, specialty).some(value => normalize(value) === normalize(city));
}
export function hospitalCountries(hospital: Hospital, treatment?: string, specialty?: string): readonly string[] {
  if (hospital.provenance?.origin === "admin_reference") {
    if (treatment) return hospital.treatmentCountries?.[treatment] ?? [];
    if (specialty) return hospital.specialtyCountries?.[specialty] ?? [];
    return [hospital.country,...(hospital.locationCountries ?? [])];
  }
  return [hospital.country];
}
export function hospitalMatchesCountry(hospital: Hospital,country?:string,treatment?:string,specialty?:string){
  return !country || hospitalCountries(hospital,treatment,specialty).some(value=>normalize(value)===normalize(country));
}
