import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { CompareForm } from "@/components/compare-form";
import { DemoNotice } from "@/components/demo-notice";
import { catalogRepository } from "@/lib/catalog/repository";
import { getComparison } from "@/lib/catalog/comparison-service";

export const metadata = { title: "Compare destinations", description: "Compare sample treatment costs, provider options and travel considerations by country." };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ procedure?: string; countryA?: string; countryB?: string }> }) {
  const params = await searchParams;
  const [treatments, countries] = await Promise.all([catalogRepository.listTreatments(), catalogRepository.listCountries()]);
  const requested = Boolean(params.procedure && params.countryA && params.countryB);
  const comparison = requested ? await getComparison(params.procedure!, params.countryA!, params.countryB!) : undefined;
  const columns = comparison ? [comparison.first, comparison.second] : [];
  return <main id="main-content" tabIndex={-1} className="container compare-page">
    <PageHeader eyebrow="COUNTRY COMPARISON" title="Compare destinations" description="Choose a treatment and two countries to compare sample costs, providers and travel needs." />
    <CompareForm treatments={treatments} countries={countries} procedure={params.procedure} countryA={params.countryA} countryB={params.countryB} />
    <DemoNotice compact />
    {requested && !comparison && <div className="result-state" role="alert"><h2>Choose two different, available countries.</h2><p>We could not build a comparison from those selections. Adjust the form above and try again.</p></div>}
    {comparison && <section className="comparison-result" aria-labelledby="comparison-title"><p className="eyebrow">SAMPLE COMPARISON</p><h2 id="comparison-title">{comparison.treatment.name}: {comparison.first.country.name} and {comparison.second.country.name}</h2>
      <div className="comparison-scroll"><table><caption>Illustrative information for planning questions only</caption><thead><tr><th scope="col">Factor</th>{columns.map((side) => <th scope="col" key={side.country.slug}>{side.country.name}</th>)}</tr></thead><tbody>
        <tr><th scope="row">Sample treatment estimate</th>{columns.map((side) => <td key={side.country.slug}>{side.sampleCostUsd != null && side.sampleCostMaxUsd != null ? `USD ${side.sampleCostUsd.toLocaleString()}–${side.sampleCostMaxUsd.toLocaleString()} · synthetic range` : "No sample estimate"}</td>)}</tr>
        <tr><th scope="row">Hospital options</th>{columns.map((side) => <td key={side.country.slug}>{side.hospitals.length} sample profiles{side.hospitals.slice(0, 2).map((item) => <Link key={item.slug} href={`/hospitals/${item.slug}`}>{item.name}</Link>)}</td>)}</tr>
        <tr><th scope="row">Doctor options</th>{columns.map((side) => <td key={side.country.slug}>{side.doctors.length} sample profiles{side.doctors.slice(0, 2).map((item) => <Link key={item.slug} href={`/doctors/${item.slug}`}>{item.name}</Link>)}</td>)}</tr>
        <tr><th scope="row">Typical stay</th>{columns.map((side) => <td key={side.country.slug}>{side.sampleStayDays ? `${side.sampleStayDays} sample days; confirm clinically` : "Not available"}</td>)}</tr>
        <tr><th scope="row">Travel considerations</th>{columns.map((side) => <td key={side.country.slug}>{side.country.travelNote}</td>)}</tr>
        <tr><th scope="row">Package availability</th>{columns.map((side) => <td key={side.country.slug}>{side.packages.length} sample packages{side.packages.slice(0, 2).map((item) => <Link key={item.slug} href={`/packages/${item.slug}`}>{item.name}</Link>)}</td>)}</tr>
      </tbody></table></div>
      <p className="comparison-result__foot">All values are synthetic. A real decision needs a current provider quote, clinician review, and official travel guidance.</p>
    </section>}
  </main>;
}
