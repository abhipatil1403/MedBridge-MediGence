import type { Metadata } from "next";
import Link from "next/link";
import { ReportPicker } from "@/components/discovery/report-picker";
import { ServiceLanding } from "@/components/service-landing";
import { getDoctorBySlug } from "@/lib/catalog/repository";
import { detailMetadata } from "@/lib/seo";

export const metadata: Metadata = detailMetadata("Second opinion", "Understand the records and steps needed for an independent professional medical review.", "/second-opinion");
export default async function SecondOpinionPage({ searchParams }: { searchParams: Promise<{ doctor?: string }> }) {
  const { doctor: slug } = await searchParams;
  const doctor = slug ? await getDoctorBySlug(slug) : undefined;
  return <ServiceLanding slug="second-opinion" title="Second opinion" intro="Prepare the question you want an independent specialist to review, with the records that provide context." nextHref="/discover?q=second%20opinion" nextLabel="Explore relevant options">
    {doctor && <p className="service-context">Selected sample profile: <Link href={`/doctors/${doctor.slug}`}>{doctor.name}</Link>. This clinician is synthetic and is not assigned to a case.</p>}
    <div className="service-panel"><h2>What a review needs</h2><p>A real request will ask for your diagnosis or concern, medical history, investigations, reports, and consent before professional assignment. A clinician must sign any final opinion.</p><ReportPicker /></div>
  </ServiceLanding>;
}
