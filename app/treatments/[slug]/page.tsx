import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DemoNotice } from "@/components/demo-notice";
import { DetailHero, DetailLinks, DetailSection, FaqList } from "@/components/detail-parts";
import { getTreatmentDetail } from "@/lib/catalog/detail-service";
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
  return <main id="main-content" tabIndex={-1} className="container detail-page">
    <Breadcrumbs currentPath={`/treatments/${slug}`} items={[{ label: "Home", href: "/" }, { label: "Treatments", href: "/treatments" }, { label: treatment.name }]} />
    <DemoNotice compact />
    <DetailHero type={`TREATMENT · ${treatment.specialty}`} title={treatment.name} intro={treatment.overview}
      facts={[treatment.category, `${countries.length} sample destinations`, "Content not clinically reviewed"]}
      actions={[{ label: "Find hospitals", href: `/discover?type=hospitals&treatment=${slug}`, primary: true }, { label: "Get a treatment plan", href: `/treatment-plan?treatment=${slug}` }]} />
    <div className="detail-layout"><div>
      <DetailSection title="Procedure overview"><p>{treatment.procedure}</p></DetailSection>
      <DetailSection title="Symptoms and indications"><p>{treatment.indications}</p></DetailSection>
      <DetailSection title="Diagnostics and records"><p>{treatment.diagnostics}</p></DetailSection>
      <DetailSection title="Recovery and follow-up"><p>{treatment.recovery}</p><Link className="text-link" href="/recovery">Explore recovery support →</Link></DetailSection>
      <DetailSection title="Estimated cost"><p className="sample-price">From USD {treatment.sampleBaseCostUsd.toLocaleString()} <small>sample estimate only</small></p><p>A real quote depends on clinical details, provider terms, included services, and the date of care. This figure is synthetic and cannot be booked.</p><Link className="text-link" href={`/compare?procedure=${slug}&countryA=india&countryB=turkey`}>Compare destinations →</Link></DetailSection>
      <DetailSection title="Available sample countries"><DetailLinks items={countries.map((item) => ({ label: item.name, href: `/discover?type=hospitals&treatment=${slug}&country=${item.slug}`, meta: "Sample provider search" }))} /></DetailSection>
      <DetailSection title="Hospitals"><DetailLinks items={hospitals.map((item) => ({ label: item.name, href: `/hospitals/${item.slug}`, meta: `${item.city} · demo, unverified` }))} /></DetailSection>
      <DetailSection title="Doctors"><DetailLinks items={doctors.map((item) => ({ label: item.name, href: `/doctors/${item.slug}`, meta: `${item.specialty} · demo, unverified` }))} /></DetailSection>
      <DetailSection title="Related treatments"><DetailLinks items={related.map((item) => ({ label: item.name, href: `/treatments/${item.slug}`, meta: item.specialty }))} /></DetailSection>
      <DetailSection title="Frequently asked questions"><FaqList items={treatment.faqs} /></DetailSection>
    </div><aside className="detail-aside"><p className="eyebrow">NEXT STEPS</p><h2>Build a clearer plan</h2><p>Compare sample destinations, inspect provider profiles, or prepare questions for a professional review.</p><Link className="button button--primary button--default" href={`/treatment-plan?treatment=${slug}`}>Get a treatment plan</Link><Link className="button button--outline button--default" href="/second-opinion">Second opinion pathway</Link><span>{packages.length} related sample package{packages.length === 1 ? "" : "s"}</span></aside></div>
  </main>;
}
