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
      <label>Treatment<select name="treatment" defaultValue={treatment?.slug ?? ""}><option value="">Choose a treatment</option>{treatments.map((item) => <option value={item.slug} key={item.slug}>{item.name}</option>)}</select></label>
      <label>Hospital<select name="hospital" defaultValue={hospital?.slug ?? ""}><option value="">No preference yet</option>{hospitals.map((item) => <option value={item.slug} key={item.slug}>{item.name}</option>)}</select></label>
      <label>Sample package<select name="package" defaultValue={selectedPackage?.slug ?? ""}><option value="">No package selected</option>{packages.map((item) => <option value={item.slug} key={item.slug}>{item.name}</option>)}</select></label>
      <button className="button button--primary button--default" type="submit">Update planning brief</button>
    </form>
    {params.plan === "1" && <section className="service-panel plan-summary" role="status"><p className="eyebrow">YOUR SAMPLE SELECTION</p><h2>Planning brief updated</h2><dl className="fact-list"><div><dt>Treatment</dt><dd>{treatment?.name ?? "To be decided"}</dd></div><div><dt>Hospital</dt><dd>{hospital?.name ?? "No preference"}</dd></div><div><dt>Package</dt><dd>{selectedPackage?.name ?? "No package selected"}</dd></div></dl><p>This URL preserves these non-sensitive selections. It is not a request, booking, or medical plan.</p></section>}
    <div className="service-page__next"><div><h2>What comes next?</h2><p>A real quote needs clinical details, current provider terms, an itemized scope, and consent. You can keep exploring sample options now.</p></div><div className="service-page__links"><Link className="button button--outline button--default" href="/discover">Explore options</Link><Link className="button button--primary button--default" href="/second-opinion">Explore second opinion</Link></div></div>
  </main>;
}
