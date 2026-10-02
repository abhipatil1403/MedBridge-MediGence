import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DemoNotice } from "@/components/demo-notice";
import { DetailHero, DetailSection, FaqList } from "@/components/detail-parts";
import { getPackageDetail } from "@/lib/catalog/detail-service";
import { detailMetadata } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPackageDetail(slug);
  return data ? detailMetadata(data.carePackage.name, data.carePackage.description, `/packages/${slug}`) : {};
}

export default async function PackageDetailPage({ params }: Props) {
  const { slug } = await params;
  const data = await getPackageDetail(slug);
  if (!data) notFound();
  const { carePackage, hospital, treatment, country } = data;
  const faq = [
    { question: "Is this an available offer?", answer: "No. This package is a synthetic example. A provider must confirm real prices, services, dates, and eligibility." },
    { question: "What happens when I prepare a planning brief?", answer: "The planning brief preserves the sample selection. It does not contact a hospital or process a payment." },
  ];
  return <main id="main-content" tabIndex={-1} className="container detail-page">
    <Breadcrumbs currentPath={`/packages/${slug}`} items={[{ label: "Home", href: "/" }, { label: "Packages", href: "/packages" }, { label: carePackage.name }]} />
    <DemoNotice compact />
    <DetailHero type="DEMO CARE PACKAGE" title={carePackage.name} intro={carePackage.description}
      facts={[country?.name ?? carePackage.country, `${carePackage.durationDays} sample days`, `USD ${carePackage.samplePriceUsd.toLocaleString()} · demo estimate`]}
      actions={[{ label: "Prepare planning brief", href: `/treatment-plan?package=${slug}`, primary: true }, { label: "View hospital", href: `/hospitals/${carePackage.hospitalSlug}` }]} />
    <div className="detail-layout"><div>
      <DetailSection title="Treatment and provider"><p>Treatment: {treatment ? <Link href={`/treatments/${treatment.slug}`}>{treatment.name}</Link> : carePackage.treatmentSlug}. Provider: {hospital ? <Link href={`/hospitals/${hospital.slug}`}>{hospital.name}</Link> : carePackage.hospitalName}.</p></DetailSection>
      <DetailSection title="Estimated price and duration"><p className="sample-price">USD {carePackage.samplePriceUsd.toLocaleString()} <small>synthetic estimate</small></p><p>Illustrative duration: {carePackage.durationDays} days. This is not a quote or a reservation.</p></DetailSection>
      <DetailSection title="Inclusions"><ul className="plain-list">{carePackage.inclusions.map((item) => <li key={item}>{item}</li>)}</ul></DetailSection>
      <DetailSection title="Exclusions"><ul className="plain-list">{carePackage.exclusions.map((item) => <li key={item}>{item}</li>)}</ul></DetailSection>
      <DetailSection title="What this example helps compare"><ul className="plain-list">{carePackage.benefits.map((item) => <li key={item}>{item}</li>)}</ul></DetailSection>
      <DetailSection title="Frequently asked questions"><FaqList items={faq} /></DetailSection>
    </div><aside className="detail-aside"><p className="eyebrow">PACKAGE PATHWAY</p><h2>Prepare the next question</h2><p>Build a planning brief around this sample package. No payment or provider request is made.</p><Link className="button button--primary button--default" href={`/treatment-plan?package=${slug}`}>Prepare planning brief</Link><Link className="button button--outline button--default" href="/packages">Browse packages</Link></aside></div>
  </main>;
}
