import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { DiscoveryResults } from "@/types/discovery";

const labels = { treatments: "Treatments", hospitals: "Hospitals", doctors: "Doctors", packages: "Packages", countries: "Countries", services: "Services" } as const;
type SectionKey = keyof typeof labels;

function detailsHref(filters: DiscoveryResults["filters"], type: SectionKey) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  params.set("type", type);
  return `/discover?${params}`;
}

export function ResultSections({ results, limit = 4 }: { results: DiscoveryResults; limit?: number }) {
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
      return <section className={`result-section result-section--${key}`} key={key} aria-labelledby={`section-${key}`}>
        <div className="result-section__head"><div><p className="eyebrow">{key === "services" ? "CARE PATHWAYS" : "EXPLORE"}</p><h2 id={`section-${key}`}>{labels[key]} <span>{items.length}</span></h2></div>
          {filters.type === "all" && items.length > limit && <Link href={detailsHref(filters, key)}>View all <ArrowRight size={16} aria-hidden="true" /></Link>}
        </div>
        <div className="result-section__items">
          {key === "treatments" && sections.treatments.slice(0, filters.type === "all" ? limit : undefined).map(({ item, reason }) => <article className="result-row" key={item.slug}>
            <div><span className="result-kicker">Treatment · {item.specialty}</span><h3><Link href={`/treatments/${item.slug}`}>{item.name}</Link></h3><p>{item.description}</p><small>{reason}</small></div>
            <Link className="result-action" href={`/treatments/${item.slug}`}>View treatment <ArrowRight size={16} aria-hidden="true" /></Link>
          </article>)}
          {key === "hospitals" && sections.hospitals.slice(0, filters.type === "all" ? limit : undefined).map(({ item, reason }) => <article className="result-row" key={item.slug}>
            <div><span className="result-kicker">Demo hospital · {item.city}, {item.country}</span><h3><Link href={`/hospitals/${item.slug}`}>{item.name}</Link></h3><p>{item.specialties.slice(0, 3).join(" · ")}</p><small>{reason} Sample beds: {item.sampleBedCount}. {item.verification}.</small></div>
            <div className="result-row__actions"><Link className="result-action" href={`/hospitals/${item.slug}`}>View hospital <ArrowRight size={16} aria-hidden="true" /></Link><Link href={`/treatment-plan?hospital=${item.slug}`}>Get treatment quote</Link></div>
          </article>)}
          {key === "doctors" && sections.doctors.slice(0, filters.type === "all" ? limit : undefined).map(({ item, reason }) => <article className="result-row" key={item.slug}>
            <div><span className="result-kicker">Demo clinician · {item.specialty}</span><h3><Link href={`/doctors/${item.slug}`}>{item.name}</Link></h3><p>{item.hospitalName} · {item.city}, {item.country}</p><small>{reason} Sample experience: {item.sampleExperienceYears} years · {item.consultationMode}.</small></div>
            <Link className="result-action" href={`/doctors/${item.slug}`}>View profile <ArrowRight size={16} aria-hidden="true" /></Link>
          </article>)}
          {key === "packages" && sections.packages.slice(0, filters.type === "all" ? limit : undefined).map(({ item, reason }) => <article className="result-row" key={item.slug}>
            <div><span className="result-kicker">Demo package · {item.country}</span><h3><Link href={`/packages/${item.slug}`}>{item.name}</Link></h3><p>{item.hospitalName} · {item.durationDays} sample days</p><small>{reason} Sample estimate: USD {item.samplePriceUsd.toLocaleString()}.</small></div>
            <Link className="result-action" href={`/packages/${item.slug}`}>View package <ArrowRight size={16} aria-hidden="true" /></Link>
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
