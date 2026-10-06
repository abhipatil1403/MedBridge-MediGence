import { T, LocalNumber } from '@/components/experience/translation';
import Link from '@/components/catalog-link';
import { ArrowRight } from "lucide-react";
import type { DiscoveryResults } from "@/types/discovery";
import { SaveButton } from '@/components/experience/saved';
import type {CatalogSnapshot} from '@/types/catalog';
import { IdentityArt } from '@/components/visual/identity-art';
import { EvidenceStrip, FactCapsules, LocationObject, PackageServicePreview, PriceBlock, ServiceCapsules, TreatmentSignals } from '@/components/visual/semantic';

const labels = { treatments: "Treatments", hospitals: "Hospitals", doctors: "Doctors", packages: "Packages", countries: "Countries", services: "Services" } as const;
type SectionKey = keyof typeof labels;

function detailsHref(filters: DiscoveryResults["filters"], type: SectionKey) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  params.set("type", type);
  return `/discover?${params}`;
}

export function ResultSections({ results, limit = 4, idPrefix = '',catalog, spotlight = false }: { results: DiscoveryResults; limit?: number; idPrefix?: string;catalog?:CatalogSnapshot;spotlight?:boolean }) {
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
          {key === "treatments" && sections.treatments.slice(0, filters.type === "all" ? limit : undefined).map(({ item, reason }) => <article className="result-row result-row--treatment" key={item.slug}>
            <div><span className="result-kicker"><T>{"Treatment ·"}</T>{' '}{item.specialty}</span><h3><Link href={`/treatments/${item.slug}`}>{item.name}</Link></h3><p>{item.description}</p><details><summary><T>{'Why this appears'}</T></summary><p>{reason}</p></details></div>
            <div>{catalog&&<TreatmentSignals item={item} catalog={catalog}/>}<Link className="result-action" href={`/treatments/${item.slug}`}><T>{"Explore treatment"}</T><ArrowRight size={16} aria-hidden="true" /></Link></div>
          </article>)}
          {key === "hospitals" && sections.hospitals.slice(0, filters.type === "all" ? limit : undefined).map(({ item, reason }, index) => <article className={`result-row${spotlight&&index===0?' result-row--identity':''}`} key={item.slug}>
            {spotlight&&index===0&&<IdentityArt name={item.name}/>}
            <div><LocationObject city={item.city} country={item.country}/><h3><Link href={`/hospitals/${item.slug}`}>{item.name}</Link></h3><FactCapsules values={item.specialties.slice(0,3)}/><EvidenceStrip item={item}/><details><summary><T>{"Why this appears"}</T></summary><p>{reason}</p><p>{item.sampleBedCount>0?`${item.demo?'Sample':'Provider-listed'} beds: ${item.sampleBedCount}. `:''}{item.verification}.</p></details></div>
            <div className="result-row__actions"><Link className="result-action" href={`/hospitals/${item.slug}`}><T>{"View hospital"}</T><ArrowRight size={16} aria-hidden="true" /></Link><SaveButton kind="hospital" recordId={item.recordId}/>{catalog&&catalog.packages.some(p=>p.hospitalSlug===item.slug)&&<Link href={`/hospitals/${item.slug}#packages`}>{catalog.packages.filter(p=>p.hospitalSlug===item.slug).length} <T>{'published packages'}</T> →</Link>}</div>
          </article>)}
          {key === "doctors" && sections.doctors.slice(0, filters.type === "all" ? limit : undefined).map(({ item, reason }, index) => <article className={`result-row${spotlight&&index===0?' result-row--identity':''}`} key={item.slug}>
            {spotlight&&index===0&&<IdentityArt name={item.name} kind="doctor"/>}
            <div><span className="doctor-monogram" aria-hidden="true">{item.name.split(' ').filter(part=>!['Demo','Clinician','Dr.','Dr'].includes(part)).slice(0,2).map(part=>part[0]).join('')}</span><FactCapsules values={[item.specialty].filter(Boolean)}/><h3><Link href={`/doctors/${item.slug}`}>{item.name}</Link></h3><LocationObject city={item.city} country={item.country}/><p className="profile-affiliation">{item.hospitalName}</p><EvidenceStrip item={item}/><small><T>{'Availability requires confirmation'}</T></small><details><summary><T>{"Profile context"}</T></summary><p>{reason} {item.sampleExperienceYears>0?`${item.demo?'Sample':'Provider-listed'} experience: ${item.sampleExperienceYears} years · `:''}{item.consultationMode === "not_confirmed" ? "Consultation mode not confirmed" : item.consultationMode}.</p></details></div>
            <SaveButton kind="doctor" recordId={item.recordId}/><Link className="result-action" href={`/doctors/${item.slug}`}><T>{"View profile"}</T><ArrowRight size={16} aria-hidden="true" /></Link>
          </article>)}
          {key === "packages" && sections.packages.slice(0, filters.type === "all" ? limit : undefined).map(({ item, reason }) => <article className="result-row result-row--package-object" key={item.slug}>
            <div><p className="profile-affiliation">{item.hospitalName}</p><h3><Link href={`/packages/${item.slug}`}>{item.name}</Link></h3><LocationObject city={item.city} country={item.country}/>{item.priceType==='published_price'&&<p className="package-condition"><T>{'Conditional published tariff; provider confirmation required.'}</T></p>}<PackageServicePreview item={item}/>{item.exclusions.length>0&&<ServiceCapsules values={item.exclusions.slice(0,1)} status="excluded"/>}<small>{item.durationDays > 0 ? <><LocalNumber value={item.durationDays}/>{' '}<T>{item.demo?'illustrative':'listed'}</T>{' '}<T>{'days'}</T></> : <T>{'Duration not published'}</T>}</small><details><summary><T>{"Matching information"}</T></summary><p>{reason}</p></details></div>
            <div className="package-decision"><PriceBlock compact item={item} sample={item.demo}/><SaveButton kind="package" recordId={item.recordId}/><EvidenceStrip item={item}/><span><T>{item.demo?'Not a quote or available offer':'Confirm current quote and availability'}</T></span><Link className="result-action" href={`/packages/${item.slug}`}><T>{"View package"}</T><ArrowRight size={16} aria-hidden="true" /></Link></div>
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
