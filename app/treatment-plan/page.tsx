import { T } from '@/components/experience/translation';
import { PageHeader } from "@/components/page-header";
import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DemoNotice } from "@/components/demo-notice";
import { catalogRepository } from "@/lib/catalog/repository";
import { detailMetadata } from "@/lib/seo";

export const metadata: Metadata = detailMetadata("Treatment planning brief", "Prepare a sample treatment, provider and package selection for later coordination.", "/treatment-plan");

export default async function TreatmentPlanPage({ searchParams }: { searchParams: Promise<{ treatment?: string; hospital?: string; package?: string; plan?: string }> }) {
  const params = await searchParams;
  const [treatments, hospitals, packages] = await Promise.all([
    catalogRepository.listTreatments(), catalogRepository.listHospitals(), catalogRepository.listPackages(),
  ]);
  const selectedPackage = packages.find((item) => item.slug === params.package);
  const treatment = treatments.find((item) => item.slug === (params.treatment ?? selectedPackage?.treatmentSlug));
  const hospital = hospitals.find((item) => item.slug === (params.hospital ?? selectedPackage?.hospitalSlug));
  return <main id="main-content" tabIndex={-1} className="container service-page">
    <Breadcrumbs currentPath="/treatment-plan" items={[{ label: "Home", href: "/" }, { label: "Treatment planning brief" }]} />
    <PageHeader eyebrow="CARE COORDINATION" title="Treatment planning brief" description="Keep your sample care options together. This brief does not contact a provider or generate a quote." />
    <DemoNotice compact />
    <form className="plan-form" action="/treatment-plan" method="get"><input type="hidden" name="plan" value="1" />
      <label><T>{"Treatment"}</T><select name="treatment" defaultValue={treatment?.slug ?? ""}><option value=""><T>{"Choose a treatment"}</T></option>{treatments.map((item) => <option value={item.slug} key={item.slug}>{item.name}</option>)}</select></label>
      <label><T>{"Hospital"}</T><select name="hospital" defaultValue={hospital?.slug ?? ""}><option value=""><T>{"No preference yet"}</T></option>{hospitals.map((item) => <option value={item.slug} key={item.slug}>{item.name}</option>)}</select></label>
      <label><T>{"Sample package"}</T><select name="package" defaultValue={selectedPackage?.slug ?? ""}><option value=""><T>{"No package selected"}</T></option>{packages.map((item) => <option value={item.slug} key={item.slug}>{item.name}</option>)}</select></label>
      <button className="button button--primary button--default" type="submit"><T>{"Update planning brief"}</T></button>
    </form>
    {params.plan === "1" && <section className="service-panel plan-summary" role="status"><p className="eyebrow"><T>{"YOUR SAMPLE SELECTION"}</T></p><h2><T>{"Planning brief updated"}</T></h2><dl className="fact-list"><div><dt><T>{"Treatment"}</T></dt><dd>{treatment?.name ?? "To be decided"}</dd></div><div><dt><T>{"Hospital"}</T></dt><dd>{hospital?.name ?? "No preference"}</dd></div><div><dt><T>{"Package"}</T></dt><dd>{selectedPackage?.name ?? "No package selected"}</dd></div></dl><p><T>{"This URL preserves these non-sensitive selections. It is not a request, booking, or medical plan."}</T></p></section>}
    <div className="service-page__next"><div><h2><T>{"What comes next?"}</T></h2><p><T>{"A real quote needs clinical details, current provider terms, an itemized scope, and consent. You can keep exploring sample options now."}</T></p></div><div className="service-page__links"><Link className="button button--outline button--default" href="/discover"><T>{"Explore options"}</T></Link><Link className="button button--primary button--default" href="/second-opinion"><T>{"Explore second opinion"}</T></Link></div></div>
  </main>;
}
