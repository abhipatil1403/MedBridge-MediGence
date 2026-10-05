import { T } from '@/components/experience/translation';
import { Price } from '@/components/experience/price';
import { PageHeader } from "@/components/page-header";
import Link from "@/components/catalog-link";
import { CompareForm } from "@/components/compare-form";
import { DemoNotice } from "@/components/demo-notice";
import { catalogRepository } from "@/lib/catalog/repository";
import { getComparison } from "@/lib/catalog/comparison-service";
import { SearchPrompt } from '@/components/search-prompt';
import { PackagePrice } from '@/components/experience/package-price';

export const metadata = { title: "Compare destinations", description: "Compare published treatment estimates, provider options and travel considerations by country." };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ procedure?: string; countryA?: string; countryB?: string }> }) {
  const params = await searchParams;
  const [treatments, countries, packages] = await Promise.all([catalogRepository.listTreatments(), catalogRepository.listCountries(),catalogRepository.listPackages()]);
  const packageOptions=packages.filter(item=>item.city==='Pune').slice(0,2);
  const requested = Boolean(params.procedure && params.countryA && params.countryB);
  const comparison = requested ? await getComparison(params.procedure!, params.countryA!, params.countryB!) : undefined;
  const columns = comparison ? [comparison.first, comparison.second] : [];
  return <main id="main-content" tabIndex={-1} className="container compare-page">
    <div className="compare-intro"><PageHeader eyebrow="A CLEARER DECISION" title="Compare healthcare options" description="Understand the differences, the published details and what still needs confirmation." /><div className="compare-orientation"><p className="eyebrow"><T>{"COMPARE, THEN ASK"}</T></p><p><T>{"Estimates, providers and practical considerations share one view. No destination is ranked or recommended."}</T></p></div></div>
    {countries.length>1?<CompareForm treatments={treatments} countries={countries} procedure={params.procedure} countryA={params.countryA} countryB={params.countryB}/>:<details className="comparison-setup"><summary><T>{'Destination comparison'}</T> · {countries.length} <T>{'published country'}</T></summary><CompareForm treatments={treatments} countries={countries} procedure={params.procedure} countryA={params.countryA} countryB={params.countryB}/></details>}
    {comparison?.treatment.demo && <DemoNotice compact />}
    {requested && !comparison && <div className="result-state" role="alert"><h2><T>{"Choose two different, available countries."}</T></h2><p><T>{"We could not build a comparison from those selections. Adjust the form above and try again."}</T></p></div>}
    {!requested && <section className="comparison-preview"><div><p className="eyebrow"><T>{'WHAT TO LOOK AT, TOGETHER'}</T></p><h2><T>{'Make the differences easier to see.'}</T></h2><p><T>{countries.length<2?'Published destination information currently covers one country. You can still ask MedBridge AI to compare available providers or packages.':'Choose two destinations to see published estimates, associated providers, packages and travel considerations.'}</T></p><ul className="comparison-preview__facts">{['Providers','Packages','Published pricing','Included services','Travel considerations','Sources and missing details'].map(label=><li key={label}><T>{label}</T></li>)}</ul></div><SearchPrompt id="compare-question" label="What would you like to compare?" suggestions/></section>}
    {!requested&&packageOptions.length===2&&<section className="comparison-real-options"><h2><T>{'Start with published packages'}</T></h2><div>{packageOptions.map(item=><article key={item.slug}><p>{item.hospitalName} · {item.city}</p><h3><Link href={`/packages/${item.slug}`}>{item.name}</Link></h3><PackagePrice compact item={item}/><p><T>{'Current price and availability need confirmation.'}</T></p></article>)}</div><Link className="button button--outline" href={`/assistant?${new URLSearchParams({q:`Compare ${packageOptions[0].name} and ${packageOptions[1].name} at ${packageOptions[0].hospitalName}.`,start:'1'})}`}><T>{'Compare these packages'}</T> →</Link></section>}
    {comparison && <section className="comparison-result" aria-labelledby="comparison-title"><p className="eyebrow"><T>{"YOUR COMPARISON · PUBLISHED INFORMATION"}</T></p><h2 id="comparison-title">{comparison.treatment.name}</h2><div className="comparison-destinations">{columns.map(side=><div key={side.country.slug}><span className="eyebrow"><T>{"DESTINATION"}</T></span><h3>{side.country.name}</h3><p>{side.hospitals.length ? `${side.hospitals.length} published provider options` : 'Provider information not available'}</p></div>)}</div>
      <div className="comparison-scroll"><table><caption><T>{"Published information for planning questions only"}</T></caption><thead><tr><th scope="col"><T>{"Factor"}</T></th>{columns.map((side) => <th scope="col" key={side.country.slug}>{side.country.name}</th>)}</tr></thead><tbody>
        <tr className="matrix-group"><th colSpan={3} scope="colgroup"><T>{"Care options & estimates"}</T></th></tr>
        <tr><th scope="row"><T>{"Published treatment estimate"}</T></th>{columns.map((side) => <td key={side.country.slug}>{side.sampleCostUsd != null && side.sampleCostMaxUsd != null ? <><Price amount={side.sampleCostUsd} originalLabel="Original listed estimate"/> – <Price amount={side.sampleCostMaxUsd} originalLabel="Original listed estimate"/> · <T>Listed estimate</T></> : <T>{"Not provided in published information"}</T>}</td>)}</tr>
        <tr><th scope="row"><T>{"Hospital options"}</T></th>{columns.map((side) => <td key={side.country.slug}>{!side.hospitals.length && 'Not provided in published information'}{side.hospitals.slice(0, 2).map((item) => <Link key={item.slug} href={`/hospitals/${item.slug}`}>{item.name}</Link>)}{side.hospitals.length > 2 && <Link href={`/discover?type=hospitals&treatment=${comparison.treatment.slug}&country=${side.country.slug}`}><T>{"Explore all"}</T>{' '}{side.hospitals.length} <T>{"published options →"}</T></Link>}</td>)}</tr>
        <tr><th scope="row"><T>{"Doctor options"}</T></th>{columns.map((side) => <td key={side.country.slug}>{!side.doctors.length && 'Not provided in published information'}{side.doctors.slice(0, 2).map((item) => <Link key={item.slug} href={`/doctors/${item.slug}`}>{item.name}</Link>)}{side.doctors.length > 2 && <Link href={`/discover?type=doctors&treatment=${comparison.treatment.slug}&country=${side.country.slug}`}><T>{"Explore all"}</T>{' '}{side.doctors.length} <T>{"published options →"}</T></Link>}</td>)}</tr>
        <tr><th scope="row"><T>{"Package availability"}</T></th>{columns.map((side) => <td key={side.country.slug}>{!side.packages.length && 'Not provided in published information'}{side.packages.slice(0, 2).map((item) => <Link key={item.slug} href={`/packages/${item.slug}`}>{item.name}</Link>)}</td>)}</tr>
        <tr className="matrix-group"><th colSpan={3} scope="colgroup"><T>{"Practical considerations"}</T></th></tr>
        <tr><th scope="row"><T>{"Typical stay"}</T></th>{columns.map((side) => <td key={side.country.slug}>{side.sampleStayDays ? `${side.sampleStayDays} listed days; confirm clinically` : "Not provided in published information"}</td>)}</tr>
        <tr><th scope="row"><T>{"Travel considerations"}</T></th>{columns.map((side) => <td key={side.country.slug}>{side.country.travelNote}</td>)}</tr>
        <tr className="matrix-group"><th colSpan={3} scope="colgroup"><T>{"Evidence & next steps"}</T></th></tr><tr><th scope="row"><T>{"Source status"}</T></th>{columns.map(side=><td key={side.country.slug}><T>{"Reviewed catalog information, not a current provider quote. Confirm provider details and official travel guidance."}</T></td>)}</tr>
      </tbody></table></div>
      <p className="comparison-result__foot"><T>{"Available information does not establish a preferred destination. A decision needs a current provider quote, clinician review, and official travel guidance."}</T></p>
    </section>}
  </main>;
}
