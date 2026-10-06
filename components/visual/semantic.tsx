import { BookOpen, Check, CircleHelp, MapPin, Minus, CircleAlert } from 'lucide-react';
import { T, LocalNumber } from '@/components/experience/translation';
import { PackagePrice } from '@/components/experience/package-price';
import { packageServiceNames } from '@/lib/catalog/package-services';
import type { PackagePriceInput } from '@/lib/catalog/pricing';
import type { CatalogRecord, CatalogSnapshot, Package, Treatment } from '@/types/catalog';

/** Canonical record values remain distinct from translated interface labels. */
export function FactCapsules({ values }: { values: readonly string[] }) {
  if (!values.length) return null;
  return <ul className="fact-capsules">{values.map(value => <li key={value}>{value}</li>)}</ul>;
}

export function LocationObject({ city, country }: { city?: string; country?: string }) {
  const countryLabel = country?.replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  const parts = [city, countryLabel].filter(Boolean);
  if (!parts.length) return null;
  return <span className="location-object"><MapPin size={14} aria-hidden="true"/><span>{parts.join(' · ')}</span></span>;
}

export function EvidenceStrip({ item }: { item: CatalogRecord }) {
  const label = item.demo ? 'Demo data'
    : item.provenance?.origin === 'admin_reference' ? 'MedBridge reference information'
      : item.provenance?.origin === 'provider_published' ? 'Provider-submitted information'
        : 'Reviewed catalog information';
  return <div className="evidence-strip"><BookOpen size={14} aria-hidden="true"/><T>{label}</T></div>;
}

export function PriceBlock({ item, compact = false, sample = false }: { item: PackagePriceInput; compact?: boolean; sample?: boolean }) {
  return <div className="price-block"><span className="price-block__label"><T>{sample ? 'Sample price' : 'Original provider price'}</T></span><PackagePrice item={item} compact={compact}/></div>;
}

type ServiceState = 'included' | 'excluded' | 'conditional' | 'not_confirmed';
const serviceLabels: Record<ServiceState, string> = { included: 'Included', excluded: 'Excluded', conditional: 'Conditional', not_confirmed: 'Not confirmed' };
export function ServiceCapsules({ values, status }: { values: readonly string[]; status: ServiceState }) {
  if (!values.length) return null;
  const Icon = status === 'included' ? Check : status === 'excluded' ? Minus : status === 'conditional' ? CircleAlert : CircleHelp;
  return <div className={`service-group service-group--${status}`}><span className="service-group__label"><Icon size={14} aria-hidden="true"/><T>{serviceLabels[status]}</T></span><ul className="service-capsules">{values.map(value => <li key={value}>{status === 'conditional' || status === 'not_confirmed' ? <T>{value}</T> : value}</li>)}</ul></div>;
}

export function PackageServicePreview({ item }: { item: Package }) {
  const conditional = Object.entries(packageServiceNames).filter(([key]) => item.serviceDetails?.[key as keyof typeof packageServiceNames]?.status === 'conditional').map(([, name]) => name);
  return <div className="package-service-preview"><ServiceCapsules values={item.inclusions.slice(0, 2)} status="included"/>{conditional.length > 0 && <ServiceCapsules values={conditional} status="conditional"/>}</div>;
}

export function TreatmentSignals({ item, catalog }: { item: Treatment; catalog: CatalogSnapshot }) {
  const providers = catalog.hospitals.filter(hospital => hospital.treatmentSlugs.includes(item.slug));
  const packages = catalog.packages.filter(value => value.treatmentSlug === item.slug);
  const cities = [...new Set(providers.flatMap(hospital => hospital.treatmentCities?.[item.slug] ?? [hospital.city]))].filter(Boolean);
  return <div className="treatment-signals"><div><span><LocalNumber value={providers.length}/></span><T>{'published providers'}</T></div><div><span><LocalNumber value={packages.length}/></span><T>{'published packages'}</T></div>{cities.length > 0 && <LocationObject city={cities.slice(0, 3).join(' · ')}/>}</div>;
}
