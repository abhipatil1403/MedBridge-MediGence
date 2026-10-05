import { T, LocalNumber } from '@/components/experience/translation';
import Link from '@/components/catalog-link';
import { ArrowRight } from "lucide-react";
import type { DiscoveryResults } from "@/types/discovery";
import { PackagePrice } from '@/components/experience/package-price';
import { priceTypeLabels } from '@/lib/catalog/pricing';
import { SaveButton } from '@/components/experience/saved';
import type {CatalogSnapshot} from '@/types/catalog';

const labels = { treatments: "Treatments", hospitals: "Hospitals", doctors: "Doctors", packages: "Packages", countries: "Countries", services: "Services" } as const;
type SectionKey = keyof typeof labels;

function detailsHref(filters: DiscoveryResults["filters"], type: SectionKey) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  params.set("type", type);
  return `/discover?${params}`;
}

export function ResultSections({ results, limit = 4, idPrefix = '',catalog }: { results: DiscoveryResults; limit?: number; idPrefix?: string;catalog?:CatalogSnapshot }) {
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
        <div className="result-section__head"><div><p className="eyebrow"><T>{key === "services" ? "CARE PATHWAYS" : "EXPLORE"}</T></p><h2 id={`${idPrefix}section-${key}`}><T>{labels[key]}</T>{' '}<span><LocalNumber value={items.length}/></span></h2></div>
          {filters.type === "all" && items.length > limit && <Link href={detailsHref(filters, key)}><T>{"View all"}</T><ArrowRight size={16} aria-hidden="true" /></Link>}
        </div>
        <div className="result-section__items">
          {key === "treatments" && sections.treatments.slice(0, filters.type === "all" ? limit : undefined).map(({ item, reason }) => <article className="result-row" key={item.slug}>
            <div><span className="result-kicker"><T>{"Treatment ·"}</T>{' '}{item.specialty}</span><h3><Link href={`/treatments/${item.slug}`}>{item.name}</Link></h3><p>{item.description}</p><small>{reason}</small></div>
            <div>{catalog&&<p className="muted">{catalog.hospitals.filter(h=>h.treatmentSlugs.includes(item.slug)).length} <T>{'published providers'}</T>{' · '}{catalog.packages.filter(p=>p.treatmentSlug===item.slug).length} <T>{'published packages'}</T></p>}<Link className="result-action" href={`/treatments/${item.slug}`}><T>{"Explore treatment"}</T><ArrowRight size={16} aria-hidden="true" /></Link></div>
          </article>)}
          {key === "hospitals" && sections.hospitals.slice(0, filters.type === "all" ? limit : undefined).map(({ item, reason }) => <article className="result-row" key={item.slug}>
            <div><span className="result-kicker">{item.city}, {item.country}</span><h3><Link href={`/hospitals/${item.slug}`}>{item.name}</Link></h3><p>{item.specialties.slice(0, 3).join(" · ")}</p><small><T>{item.demo?'Synthetic provider · not verified':item.provenance?.origin==='admin_reference'?'MedBridge reference information':'Published provider · inspect field evidence'}</T></small><details><summary><T>{"Why this appears"}</T></summary><p>{reason}</p><p>{item.sampleBedCount>0?`${item.demo?'Sample':'Provider-listed'} beds: ${item.sampleBedCount}. `:''}{item.verification}.</p></details></div>
            <div className="result-row__actions"><Link className="result-action" href={`/hospitals/${item.slug}`}><T>{"View hospital"}</T><ArrowRight size={16} aria-hidden="true" /></Link><SaveButton kind="hospital" recordId={item.recordId}/>{catalog&&catalog.packages.some(p=>p.hospitalSlug===item.slug)&&<Link href={`/hospitals/${item.slug}#packages`}>{catalog.packages.filter(p=>p.hospitalSlug===item.slug).length} <T>{'published packages'}</T> →</Link>}</div>
          </article>)}
          {key === "doctors" && sections.doctors.slice(0, filters.type === "all" ? limit : undefined).map(({ item, reason }) => <article className="result-row" key={item.slug}>
            <div><span className="doctor-monogram" aria-hidden="true">{item.name.split(' ').filter(part=>!['Demo','Clinician','Dr.','Dr'].includes(part)).slice(0,2).map(part=>part[0]).join('')}</span><span className="result-kicker">{item.specialty}</span><h3><Link href={`/doctors/${item.slug}`}>{item.name}</Link></h3><p>{item.city}, {item.country}<br />{item.hospitalName}</p><small><T>{item.demo?'Synthetic clinician · no live appointments':item.provenance?.origin==='admin_reference'?'MedBridge reference profile · confirm availability':'Published clinician · availability requires confirmation'}</T></small><details><summary><T>{"Profile context"}</T></summary><p>{reason} {item.sampleExperienceYears>0?`${item.demo?'Sample':'Provider-listed'} experience: ${item.sampleExperienceYears} years · `:''}{item.consultationMode === "not_confirmed" ? "Consultation mode not confirmed" : item.consultationMode}.</p></details></div>
            <SaveButton kind="doctor" recordId={item.recordId}/><Link className="result-action" href={`/doctors/${item.slug}`}><T>{"View profile"}</T><ArrowRight size={16} aria-hidden="true" /></Link>
          </article>)}
          {key === "packages" && sections.packages.slice(0, filters.type === "all" ? limit : undefined).map(({ item, reason }) => <article className="result-row" key={item.slug}>
            <div><span className="result-kicker">{item.country} · <T>{item.demo?'demo package':'published package'}</T></span><h3><Link href={`/packages/${item.slug}`}>{item.name}</Link></h3><p>{item.hospitalName}{item.city?` · ${item.city}`:''}</p>{item.priceType==='published_price'&&<p className="package-condition"><T>{'Conditional published tariff; provider confirmation required.'}</T></p>}<p className="muted">{item.inclusions.slice(0,2).join(' · ')}</p>{item.exclusions.length>0&&<p className="muted"><T>{'Exclusions'}</T>: {item.exclusions.slice(0,1).join(' · ')}</p>}<small>{item.durationDays > 0 ? <><LocalNumber value={item.durationDays}/>{' '}<T>{item.demo?'illustrative':'listed'}</T>{' '}<T>{'days'}</T></> : <T>{'Duration not published'}</T>}</small><details><summary><T>{"Matching information"}</T></summary><p>{reason}</p></details></div>
            <div className="package-decision"><SaveButton kind="package" recordId={item.recordId}/><span><T>{item.demo?'SYNTHETIC ESTIMATE':priceTypeLabels[item.priceType ?? 'estimate'] ?? 'Price not published'}</T></span><strong><PackagePrice compact item={item}/></strong><span><T>{item.demo?'Not a quote or available offer':'Confirm current quote and availability'}</T></span><Link className="result-action" href={`/packages/${item.slug}`}><T>{"View package"}</T><ArrowRight size={16} aria-hidden="true" /></Link></div>
          </article>)}
          {key === "countries" && sections.countries.slice(0, filters.type === "all" ? limit : undefined).map(({ item, reason }) => <article className="result-row" key={item.slug}>
            <div><span className="result-kicker"><T>{"Destination ·"}</T>{' '}{item.code}</span><h3><Link href={`/compare?countryA=${item.slug}`}>{item.name}</Link></h3><p>{item.description}</p><small>{reason}</small></div>
            <Link className="result-action" href={`/compare?countryA=${item.slug}`}><T>{"Compare options"}</T><ArrowRight size={16} aria-hidden="true" /></Link>
          </article>)}
          {key === "services" && sections.services.slice(0, filters.type === "all" ? limit : undefined).map(({ item, reason }) => <article className="result-row" key={item.slug}>
            <div><span className="result-kicker"><T>{"Care service ·"}</T>{' '}{item.category}</span><h3><Link href={item.href}>{item.name}</Link></h3><p>{item.description}</p><small>{reason}</small></div>
            <Link className="result-action" href={item.href}><T>{"Explore service"}</T><ArrowRight size={16} aria-hidden="true" /></Link>
          </article>)}
        </div>
      </section>;
    })}
  </div>;
}
