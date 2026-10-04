import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DemoNotice } from "@/components/demo-notice";
import { DetailHero, DetailNavigation, DetailLinks, DetailSection, FaqList } from "@/components/detail-parts";
import { getTreatmentDetail } from "@/lib/catalog/detail-service";
import { CatalogProvenance } from "@/components/catalog-provenance";
import { detailMetadata } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getTreatmentDetail(slug);
  return data ? detailMetadata(data.treatment.name, data.treatment.description, `/treatments/${slug}`) : {};
}

export default async function TreatmentDetailPage({ params }: Props) {
  const { slug } = await params;
  const data = await getTreatmentDetail(slug);
  if (!data) notFound();
  const { treatment, hospitals, doctors, packages, countries, related } = data;
  return <main id="main-content" tabIndex={-1} className="container detail-page detail-page--treatment">
    <Breadcrumbs currentPath={`/treatments/${slug}`} items={[{ label: "Home", href: "/" }, { label: "Treatments", href: "/treatments" }, { label: treatment.name }]} />
    {treatment.demo && <DemoNotice compact />}
    <DetailHero type={`TREATMENT · ${treatment.specialty}`} title={treatment.name} intro={treatment.overview}
      facts={[treatment.category, `${countries.length} published destinations`, "Content not clinically reviewed"]}
      actions={[{ label: "Find hospitals", href: `/discover?type=hospitals&treatment=${slug}`, primary: true }, { label: "Get a treatment plan", href: `/treatment-plan?treatment=${slug}` }]} />
    <DetailNavigation items={[{label:"Overview",href:"#procedure-overview"},{label:"Recovery",href:"#recovery-and-follow-up"},{label:"Cost",href:"#estimated-cost"},{label:"Hospitals",href:"#hospitals"},{label:"Doctors",href:"#doctors"}]} />
    <div className="detail-layout"><div>
      <DetailSection title="Procedure overview"><p>{treatment.procedure || "Not provided in published information."}</p></DetailSection>
      <DetailSection title="Symptoms and indications"><p>{treatment.indications || "Not provided in published information."}</p></DetailSection>
      <DetailSection title="Diagnostics and records"><p>{treatment.diagnostics || "Not provided in published information."}</p></DetailSection>
      <DetailSection title="Recovery and follow-up"><p>{treatment.recovery || "Not provided in published information."}</p><Link className="text-link" href="/recovery">Explore recovery support →</Link></DetailSection>
      <DetailSection title="Estimated cost">{treatment.sampleBaseCostUsd > 0 ? <p>From USD {treatment.sampleBaseCostUsd.toLocaleString()} · published estimate</p> : <p>Not provided in published information.</p>}<p>A current quote depends on clinical details, provider terms, included services and dates.</p><Link className="text-link" href={`/compare?procedure=${slug}`}>Compare destinations →</Link></DetailSection>
      <DetailSection title="Published destinations"><DetailLinks items={countries.map((item) => ({ label: item.name, href: `/discover?type=hospitals&treatment=${slug}&country=${item.slug}`, meta: "Published provider search" }))} /></DetailSection>
      <DetailSection title="Hospitals"><DetailLinks items={hospitals.map((item) => ({ label: item.name, href: `/hospitals/${item.slug}`, meta: `${item.city} · published profile` }))} /></DetailSection>
      <DetailSection title="Doctors"><DetailLinks items={doctors.map((item) => ({ label: item.name, href: `/doctors/${item.slug}`, meta: `${item.specialty} · published profile` }))} /></DetailSection>
      <DetailSection title="Related treatments"><DetailLinks items={related.map((item) => ({ label: item.name, href: `/treatments/${item.slug}`, meta: item.specialty }))} /></DetailSection>
      {!!treatment.faqs.length && <DetailSection title="Frequently asked questions"><FaqList items={treatment.faqs} /></DetailSection>}
    </div><aside className="detail-aside"><p className="eyebrow">NEXT STEPS</p><h2>Build a clearer plan</h2><CatalogProvenance item={treatment} /><p>Compare published destinations, inspect provider profiles, or prepare questions for a professional review.</p><Link className="button button--primary button--default" href={`/treatment-plan?treatment=${slug}`}>Get a treatment plan</Link><Link className="button button--outline button--default" href="/second-opinion">Second opinion pathway</Link><span>{packages.length} related published package{packages.length === 1 ? "" : "s"}</span></aside></div>
  </main>;
}
