import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { DiscoveryResults } from "@/types/discovery";
import { packagePrice } from '@/lib/catalog/pricing';

const labels = { treatments: "Treatments", hospitals: "Hospitals", doctors: "Doctors", packages: "Packages", countries: "Countries", services: "Services" } as const;
type SectionKey = keyof typeof labels;

function detailsHref(filters: DiscoveryResults["filters"], type: SectionKey) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  params.set("type", type);
  return `/discover?${params}`;
}

export function ResultSections({ results, limit = 4, idPrefix = '' }: { results: DiscoveryResults; limit?: number; idPrefix?: string }) {
  const { sections, filters } = results;
  const keys: SectionKey[] = ["treatments", "hospitals", "doctors", "packages", "countries", "services"];
  if (results.understanding.intent === "hospital") keys.unshift(...keys.splice(keys.indexOf("hospitals"), 1));
  if (results.understanding.intent === "doctor") keys.unshift(...keys.splice(keys.indexOf("doctors"), 1));
  if (results.understanding.intent === "package") keys.unshift(...keys.splice(keys.indexOf("packages"), 1));
  if (["second-opinion", "consultation", "travel", "recovery"].includes(results.understanding.intent)) keys.unshift(...keys.splice(keys.indexOf("services"), 1));

  return <div className="result-sections">
    {keys.map((key) => {
      const items = sections[key];
      if (items.length === 0) return null;
      return <section className={`result-section result-section--${key}`} key={key} aria-labelledby={`${idPrefix}section-${key}`}>
        <div className="result-section__head"><div><p className="eyebrow">{key === "services" ? "CARE PATHWAYS" : "EXPLORE"}</p><h2 id={`${idPrefix}section-${key}`}>{labels[key]} <span>{items.length}</span></h2></div>
          {filters.type === "all" && items.length > limit && <Link href={detailsHref(filters, key)}>View all <ArrowRight size={16} aria-hidden="true" /></Link>}
        </div>
        <div className="result-section__items">
          {key === "treatments" && sections.treatments.slice(0, filters.type === "all" ? limit : undefined).map(({ item, reason }) => <article className="result-row" key={item.slug}>
            <div><span className="result-kicker">Treatment · {item.specialty}</span><h3><Link href={`/treatments/${item.slug}`}>{item.name}</Link></h3><p>{item.description}</p><small>{reason}</small></div>
            <Link className="result-action" href={`/treatments/${item.slug}`}>View treatment <ArrowRight size={16} aria-hidden="true" /></Link>
          </article>)}
          {key === "hospitals" && sections.hospitals.slice(0, filters.type === "all" ? limit : undefined).map(({ item, reason }) => <article className="result-row" key={item.slug}>
            <div><span className="result-kicker">{item.city}, {item.country}</span><h3><Link href={`/hospitals/${item.slug}`}>{item.name}</Link></h3><p>{item.specialties.slice(0, 3).join(" · ")}</p><small>{item.demo?'Synthetic provider · not verified':item.provenance?.origin==='admin_reference'?'MedBridge reference information':'Published provider · inspect field evidence'}</small><details><summary>Why this appears</summary><p>{reason}</p><p>{item.sampleBedCount>0?`${item.demo?'Sample':'Provider-listed'} beds: ${item.sampleBedCount}. `:''}{item.verification}.</p></details></div>
            <div className="result-row__actions"><Link className="result-action" href={`/hospitals/${item.slug}`}>View hospital <ArrowRight size={16} aria-hidden="true" /></Link><Link href={`/treatment-plan?hospital=${item.slug}`}>Prepare planning brief</Link></div>
          </article>)}
          {key === "doctors" && sections.doctors.slice(0, filters.type === "all" ? limit : undefined).map(({ item, reason }) => <article className="result-row" key={item.slug}>
            <div><span className="doctor-monogram" aria-hidden="true">{item.name.split(' ').filter(part=>!['Demo','Clinician'].includes(part)).slice(0,2).map(part=>part[0]).join('')}</span><span className="result-kicker">{item.specialty}</span><h3><Link href={`/doctors/${item.slug}`}>{item.name}</Link></h3><p>{item.city}, {item.country}<br />{item.hospitalName}</p><small>{item.demo?'Synthetic clinician · no live appointments':item.provenance?.origin==='admin_reference'?'MedBridge reference profile · confirm availability':'Published clinician · availability requires confirmation'}</small><details><summary>Profile context</summary><p>{reason} {item.sampleExperienceYears>0?`${item.demo?'Sample':'Provider-listed'} experience: ${item.sampleExperienceYears} years · `:''}{item.consultationMode === "not_confirmed" ? "Consultation mode not confirmed" : item.consultationMode}.</p></details></div>
            <Link className="result-action" href={`/doctors/${item.slug}`}>View profile <ArrowRight size={16} aria-hidden="true" /></Link>
          </article>)}
          {key === "packages" && sections.packages.slice(0, filters.type === "all" ? limit : undefined).map(({ item, reason }) => <article className="result-row" key={item.slug}>
            <div><span className="result-kicker">{item.country} · {item.demo?'demo package':'published package'}</span><h3><Link href={`/packages/${item.slug}`}>{item.name}</Link></h3><p>{item.hospitalName}</p><small>{item.durationDays} {item.demo?'illustrative':'listed'} days</small><details><summary>Matching information</summary><p>{reason}</p></details></div>
            <div className="package-decision"><span>{item.demo?'SYNTHETIC ESTIMATE':'PROVIDER-LISTED ESTIMATE'}</span><strong>{packagePrice(item)}</strong><span>{item.demo?'Not a quote or available offer':'Confirm current quote and availability'}</span><Link className="result-action" href={`/packages/${item.slug}`}>View package <ArrowRight size={16} aria-hidden="true" /></Link></div>
          </article>)}
          {key === "countries" && sections.countries.slice(0, filters.type === "all" ? limit : undefined).map(({ item, reason }) => <article className="result-row" key={item.slug}>
            <div><span className="result-kicker">Destination · {item.code}</span><h3><Link href={`/compare?countryA=${item.slug}`}>{item.name}</Link></h3><p>{item.description}</p><small>{reason}</small></div>
            <Link className="result-action" href={`/compare?countryA=${item.slug}`}>Compare options <ArrowRight size={16} aria-hidden="true" /></Link>
          </article>)}
          {key === "services" && sections.services.slice(0, filters.type === "all" ? limit : undefined).map(({ item, reason }) => <article className="result-row" key={item.slug}>
            <div><span className="result-kicker">Care service · {item.category}</span><h3><Link href={item.href}>{item.name}</Link></h3><p>{item.description}</p><small>{reason}</small></div>
            <Link className="result-action" href={item.href}>Explore service <ArrowRight size={16} aria-hidden="true" /></Link>
          </article>)}
        </div>
      </section>;
    })}
  </div>;
}
