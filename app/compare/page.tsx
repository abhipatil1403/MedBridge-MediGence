import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { CompareForm } from "@/components/compare-form";
import { DemoNotice } from "@/components/demo-notice";
import { catalogRepository } from "@/lib/catalog/repository";
import { getComparison } from "@/lib/catalog/comparison-service";

export const metadata = { title: "Compare destinations", description: "Compare published treatment estimates, provider options and travel considerations by country." };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ procedure?: string; countryA?: string; countryB?: string }> }) {
  const params = await searchParams;
  const [treatments, countries] = await Promise.all([catalogRepository.listTreatments(), catalogRepository.listCountries()]);
  const requested = Boolean(params.procedure && params.countryA && params.countryB);
  const comparison = requested ? await getComparison(params.procedure!, params.countryA!, params.countryB!) : undefined;
  const columns = comparison ? [comparison.first, comparison.second] : [];
  return <main id="main-content" tabIndex={-1} className="container compare-page">
    <div className="compare-intro"><PageHeader eyebrow="A CLEARER DECISION" title="Place your options side by side." description="Compare a treatment across two destinations. See the available options and the information still needed." /><div className="compare-orientation"><p className="eyebrow">COMPARE, THEN ASK</p><p>Estimates, providers and practical considerations share one view. No destination is ranked or recommended.</p></div></div>
    <CompareForm treatments={treatments} countries={countries} procedure={params.procedure} countryA={params.countryA} countryB={params.countryB} />
    {comparison?.treatment.demo && <DemoNotice compact />}
    {requested && !comparison && <div className="result-state" role="alert"><h2>Choose two different, available countries.</h2><p>We could not build a comparison from those selections. Adjust the form above and try again.</p></div>}
    {!requested && <div className="comparison-empty"><p className="eyebrow">YOUR COMPARISON STARTS ABOVE</p><h2>One treatment. Two perspectives.</h2><p>Choose two destinations to see published estimates, associated providers, packages and travel considerations.</p></div>}
    {comparison && <section className="comparison-result" aria-labelledby="comparison-title"><p className="eyebrow">YOUR COMPARISON · PUBLISHED INFORMATION</p><h2 id="comparison-title">{comparison.treatment.name}</h2><div className="comparison-destinations">{columns.map(side=><div key={side.country.slug}><span className="eyebrow">DESTINATION</span><h3>{side.country.name}</h3><p>{side.hospitals.length ? `${side.hospitals.length} published provider options` : 'Provider information not available'}</p></div>)}</div>
      <div className="comparison-scroll"><table><caption>Published information for planning questions only</caption><thead><tr><th scope="col">Factor</th>{columns.map((side) => <th scope="col" key={side.country.slug}>{side.country.name}</th>)}</tr></thead><tbody>
        <tr className="matrix-group"><th colSpan={3} scope="colgroup">Care options & estimates</th></tr>
        <tr><th scope="row">Published treatment estimate</th>{columns.map((side) => <td key={side.country.slug}>{side.sampleCostUsd != null && side.sampleCostMaxUsd != null ? `USD ${side.sampleCostUsd.toLocaleString()}–${side.sampleCostMaxUsd.toLocaleString()} · listed range` : "Not provided in published information"}</td>)}</tr>
        <tr><th scope="row">Hospital options</th>{columns.map((side) => <td key={side.country.slug}>{!side.hospitals.length && 'Not provided in published information'}{side.hospitals.slice(0, 2).map((item) => <Link key={item.slug} href={`/hospitals/${item.slug}`}>{item.name}</Link>)}{side.hospitals.length > 2 && <Link href={`/discover?type=hospitals&treatment=${comparison.treatment.slug}&country=${side.country.slug}`}>Explore all {side.hospitals.length} published options →</Link>}</td>)}</tr>
        <tr><th scope="row">Doctor options</th>{columns.map((side) => <td key={side.country.slug}>{!side.doctors.length && 'Not provided in published information'}{side.doctors.slice(0, 2).map((item) => <Link key={item.slug} href={`/doctors/${item.slug}`}>{item.name}</Link>)}{side.doctors.length > 2 && <Link href={`/discover?type=doctors&treatment=${comparison.treatment.slug}&country=${side.country.slug}`}>Explore all {side.doctors.length} published options →</Link>}</td>)}</tr>
        <tr><th scope="row">Package availability</th>{columns.map((side) => <td key={side.country.slug}>{!side.packages.length && 'Not provided in published information'}{side.packages.slice(0, 2).map((item) => <Link key={item.slug} href={`/packages/${item.slug}`}>{item.name}</Link>)}</td>)}</tr>
        <tr className="matrix-group"><th colSpan={3} scope="colgroup">Practical considerations</th></tr>
        <tr><th scope="row">Typical stay</th>{columns.map((side) => <td key={side.country.slug}>{side.sampleStayDays ? `${side.sampleStayDays} listed days; confirm clinically` : "Not provided in published information"}</td>)}</tr>
        <tr><th scope="row">Travel considerations</th>{columns.map((side) => <td key={side.country.slug}>{side.country.travelNote}</td>)}</tr>
        <tr className="matrix-group"><th colSpan={3} scope="colgroup">Evidence & next steps</th></tr><tr><th scope="row">Source status</th>{columns.map(side=><td key={side.country.slug}>Reviewed catalog information, not a current provider quote. Confirm provider details and official travel guidance.</td>)}</tr>
      </tbody></table></div>
      <p className="comparison-result__foot">Available information does not establish a preferred destination. A decision needs a current provider quote, clinician review, and official travel guidance.</p>
    </section>}
  </main>;
}
