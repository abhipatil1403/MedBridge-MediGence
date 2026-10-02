import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DemoNotice } from "@/components/demo-notice";
import { DetailHero, DetailNavigation, DetailLinks, DetailSection, FaqList } from "@/components/detail-parts";
import { getDoctorDetail } from "@/lib/catalog/detail-service";
import { detailMetadata } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getDoctorDetail(slug);
  return data ? detailMetadata(data.doctor.name, data.doctor.description, `/doctors/${slug}`) : {};
}

export default async function DoctorDetailPage({ params }: Props) {
  const { slug } = await params;
  const data = await getDoctorDetail(slug);
  if (!data) notFound();
  const { doctor, hospital, country, treatments } = data;
  const faq = [
    { question: "Can I book this clinician now?", answer: "No. This is a synthetic demonstration profile. The consultation page explains the future booking workflow but does not reserve a slot." },
    { question: "Are the qualifications verified?", answer: "No qualifications are asserted for this demo profile. Production profiles will require evidence and review before publication." },
  ];
  return <main id="main-content" tabIndex={-1} className="container detail-page detail-page--doctor">
    <Breadcrumbs currentPath={`/doctors/${slug}`} items={[{ label: "Home", href: "/" }, { label: "Doctors", href: "/doctors" }, { label: doctor.name }]} />
    <DemoNotice compact />
    <DetailHero type="DEMO CLINICIAN" title={doctor.name} intro={doctor.description}
      facts={[doctor.specialty, `${doctor.city}, ${country?.name ?? doctor.country}`, `Sample experience: ${doctor.sampleExperienceYears} years`, doctor.verification]}
      actions={[{ label: "Explore consultation", href: `/consultation?doctor=${slug}`, primary: true }, { label: "Request second opinion", href: `/second-opinion?doctor=${slug}` }]} />
    <DetailNavigation items={[{label:"Profile",href:"#specialty-and-hospital"},{label:"Qualifications",href:"#experience-and-qualifications"},{label:"Procedures",href:"#procedures"},{label:"Consultation",href:"#consultation"}]} />
    <div className="detail-layout"><div>
      <DetailSection title="Specialty and hospital"><p>{doctor.specialty} · {hospital ? <Link href={`/hospitals/${hospital.slug}`}>{hospital.name}</Link> : doctor.hospitalName}. Affiliation is part of the synthetic catalog and is not verified.</p></DetailSection>
      <DetailSection title="Experience and qualifications"><dl className="fact-list"><div><dt>Sample experience</dt><dd>{doctor.sampleExperienceYears} years (illustrative)</dd></div><div><dt>Qualifications</dt><dd>{doctor.qualifications[0]}</dd></div><div><dt>Verification</dt><dd>{doctor.verification}</dd></div></dl></DetailSection>
      <DetailSection title="Languages"><ul className="tag-list">{doctor.languages.map((item) => <li key={item}>{item} (sample)</li>)}</ul></DetailSection>
      <DetailSection title="Procedures"><DetailLinks items={treatments.map((item) => ({ label: item.name, href: `/treatments/${item.slug}`, meta: item.specialty }))} /></DetailSection>
      <DetailSection title="Consultation"><p>Sample consultation mode: {doctor.consultationMode}. No live slots, prices, or booking availability are connected.</p><Link className="text-link" href={`/consultation?doctor=${slug}`}>Review consultation pathway →</Link></DetailSection>
      <DetailSection title="Second opinion"><p>A professional second opinion requires records, consent, specialist assignment and review. This profile is a demo and is not eligible to provide an opinion.</p><Link className="text-link" href={`/second-opinion?doctor=${slug}`}>Explore second opinions →</Link></DetailSection>
      <DetailSection title="Frequently asked questions"><FaqList items={faq} /></DetailSection>
    </div><aside className="detail-aside"><p className="eyebrow">NEXT STEPS</p><h2>Explore a consultation</h2><p>The consultation workflow explains what information and confirmation a real appointment would require.</p><Link className="button button--primary button--default" href={`/consultation?doctor=${slug}`}>Explore consultation</Link><Link className="button button--outline button--default" href={`/second-opinion?doctor=${slug}`}>Request second opinion</Link></aside></div>
  </main>;
}
