import { T } from '@/components/experience/translation';
import type { Metadata } from "next";
import { SaveButton } from '@/components/experience/saved';
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DemoNotice } from "@/components/demo-notice";
import {
  DetailHero,
  DetailNavigation,
  DetailLinks,
  DetailSection,
  FaqList,
} from "@/components/detail-parts";
import { getDoctorDetail } from "@/lib/catalog/detail-service";
import { detailMetadata } from "@/lib/seo";
import Image from "next/image";
import { publishedRecordProfile } from "@/lib/catalog/provider-profile";
import { CatalogProvenance } from "@/components/catalog-provenance";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getDoctorDetail(slug);
  return data
    ? detailMetadata(
        data.doctor.name,
        data.doctor.description,
        `/doctors/${slug}`,
      )
    : {};
}

export default async function DoctorDetailPage({ params }: Props) {
  const { slug } = await params;
  const data = await getDoctorDetail(slug);
  if (!data) notFound();
  const { doctor, hospital, country, treatments } = data;
  const profile = await publishedRecordProfile("doctor", doctor.recordId);
  if (!doctor.demo || profile) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="container detail-page detail-page--doctor"
      >
        <Breadcrumbs
          currentPath={`/doctors/${slug}`}
          items={[
            { label: "Home", href: "/" },
            { label: "Doctors", href: "/doctors" },
            { label: doctor.name },
          ]}
        />
        {doctor.demo && <DemoNotice compact />}
        <div className="inline-actions"><SaveButton kind="doctor" recordId={doctor.recordId}/></div>
        {profile?.hasImage && (
          <Image
            src={`/api/providers/${doctor.recordId}/image`}
            alt={doctor.name}
            width={160}
            height={160}
            unoptimized
          />
        )}
        <DetailHero
          type="PUBLISHED DOCTOR PROFILE"
          title={doctor.name}
          intro={doctor.description}
          facts={[
            doctor.specialty || "Specialty not provided",
            [doctor.city, country?.name ?? doctor.country].filter(Boolean).join(", ") || "Location not provided",
          ]}
          actions={[
            {
              label: "Open care workspace",
              href: `/assistant?q=${encodeURIComponent(`Show ${doctor.name}`)}`,
              primary: true,
            },
          ]}
        />
        <div className="detail-layout">
          <div>
            <DetailSection title="Specialty and hospital">
              <p>
                {profile?.professionalTitle || "Professional title not provided"}
                {" · "}{doctor.specialty || "Specialty not provided"}{" · "}
                {profile?.department || "Department not provided"}
              </p>
              {hospital && (
                <Link href={`/hospitals/${hospital.slug}`}>
                  {hospital.name}
                </Link>
              )}
              {!hospital && <p><T>{"Hospital affiliation not provided in published information."}</T></p>}
            </DetailSection>
            <DetailSection title="Experience and credentials">
              <p>
                {doctor.sampleExperienceYears > 0
                  ? `${doctor.sampleExperienceYears} years of provider-listed experience`
                  : "Experience not provided"}
              </p>
              {doctor.qualifications.map((item) => (
                <p key={item}>{item}</p>
              ))}
              {!doctor.qualifications.length && <p><T>{"Qualifications not provided"}</T></p>}
              <p>
                <T>{"Publication review does not independently verify professional registration or establish clinical suitability."}</T></p>
            </DetailSection>
            <DetailSection title="Languages">
              {!doctor.languages.length && <p><T>{"Languages not provided"}</T></p>}
              <ul>
                {doctor.languages.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </DetailSection>
            <DetailSection title="Procedures">
              {!treatments.length && <p><T>{"Not provided in published information."}</T></p>}
              <DetailLinks
                items={treatments.map((item) => ({
                  label: item.name,
                  href: `/treatments/${item.slug}`,
                }))}
              />
            </DetailSection>
            <DetailSection title="Consultation">
              <p>
                <T>{"Consultation mode:"}</T>{' '}{doctor.consultationMode === "not_confirmed" ? "Not confirmed in published information" : doctor.consultationMode}<T>{". Appointment availability requires confirmation."}</T></p>
            </DetailSection>
          </div>
          <aside className="detail-aside">
            <h2><T>{"Coordinate a request"}</T></h2>
            <p>
              <T>{"Ask support to coordinate an authorized request. No appointment is booked from this page."}</T></p>
            <CatalogProvenance item={doctor} kind="doctor" />
            <Link className="button button--primary" href="/help">
              <T>{"Get support"}</T></Link>
          </aside>
        </div>
      </main>
    );
  }
  const faq = [
    {
      question: "Can I book this clinician now?",
      answer:
        "No. This is a synthetic demonstration profile. The consultation page explains the future booking workflow but does not reserve a slot.",
    },
    {
      question: "Are the qualifications verified?",
      answer:
        "No qualifications are asserted for this demo profile. Production profiles will require evidence and review before publication.",
    },
  ];
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="container detail-page detail-page--doctor"
    >
      <Breadcrumbs
        currentPath={`/doctors/${slug}`}
        items={[
          { label: "Home", href: "/" },
          { label: "Doctors", href: "/doctors" },
          { label: doctor.name },
        ]}
      />
      <DemoNotice compact />
      <DetailHero
        type="DEMO CLINICIAN"
        title={doctor.name}
        intro={doctor.description}
        facts={[
          doctor.specialty,
          `${doctor.city}, ${country?.name ?? doctor.country}`,
          `Sample experience: ${doctor.sampleExperienceYears} years`,
          doctor.verification,
        ]}
        actions={[
          {
            label: "Explore consultation",
            href: `/consultation?doctor=${slug}`,
            primary: true,
          },
          {
            label: "Request second opinion",
            href: `/second-opinion?doctor=${slug}`,
          },
        ]}
      />
      <DetailNavigation
        items={[
          { label: "Profile", href: "#specialty-and-hospital" },
          { label: "Qualifications", href: "#experience-and-qualifications" },
          { label: "Procedures", href: "#procedures" },
          { label: "Consultation", href: "#consultation" },
        ]}
      />
      <div className="detail-layout">
        <div>
          <DetailSection title="Specialty and hospital">
            <p>
              {doctor.specialty} ·{" "}
              {hospital ? (
                <Link href={`/hospitals/${hospital.slug}`}>
                  {hospital.name}
                </Link>
              ) : (
                doctor.hospitalName
              )}
              <T>{". Affiliation is part of the synthetic catalog and is not verified."}</T></p>
          </DetailSection>
          <DetailSection title="Experience and qualifications">
            <dl className="fact-list">
              <div>
                <dt><T>{"Sample experience"}</T></dt>
                <dd>{doctor.sampleExperienceYears} <T>{"years (illustrative)"}</T></dd>
              </div>
              <div>
                <dt><T>{"Qualifications"}</T></dt>
                <dd>{doctor.qualifications[0]}</dd>
              </div>
              <div>
                <dt><T>{"Verification"}</T></dt>
                <dd>{doctor.verification}</dd>
              </div>
            </dl>
          </DetailSection>
          <DetailSection title="Languages">
            <ul className="tag-list">
              {doctor.languages.map((item) => (
                <li key={item}>{item} <T>{"(sample)"}</T></li>
              ))}
            </ul>
          </DetailSection>
          <DetailSection title="Procedures">
            <DetailLinks
              items={treatments.map((item) => ({
                label: item.name,
                href: `/treatments/${item.slug}`,
                meta: item.specialty,
              }))}
            />
          </DetailSection>
          <DetailSection title="Consultation">
            <p>
              <T>{"Sample consultation mode:"}</T>{' '}{doctor.consultationMode}<T>{". No live slots, prices, or booking availability are connected."}</T></p>
            <Link className="text-link" href={`/consultation?doctor=${slug}`}>
              <T>{"Review consultation pathway →"}</T></Link>
          </DetailSection>
          <DetailSection title="Second opinion">
            <p>
              <T>{"A professional second opinion requires records, consent, specialist assignment and review. This profile is a demo and is not eligible to provide an opinion."}</T></p>
            <Link className="text-link" href={`/second-opinion?doctor=${slug}`}>
              <T>{"Explore second opinions →"}</T></Link>
          </DetailSection>
          <DetailSection title="Frequently asked questions">
            <FaqList items={faq} />
          </DetailSection>
        </div>
        <aside className="detail-aside">
          <p className="eyebrow"><T>{"NEXT STEPS"}</T></p>
          <h2><T>{"Explore a consultation"}</T></h2>
          <p>
            <T>{"The consultation workflow explains what information and confirmation a real appointment would require."}</T></p>
          <Link
            className="button button--primary button--default"
            href={`/consultation?doctor=${slug}`}
          >
            <T>{"Explore consultation"}</T></Link>
          <Link
            className="button button--outline button--default"
            href={`/second-opinion?doctor=${slug}`}
          >
            <T>{"Request second opinion"}</T></Link>
        </aside>
      </div>
    </main>
  );
}
