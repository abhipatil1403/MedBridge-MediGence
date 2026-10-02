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
  return <ServiceLanding slug="second-opinion" title="A fresh perspective starts with your question." intro="Bring your question and the records that support it. A qualified professional provides the review." nextHref="/discover?q=second%20opinion" nextLabel="Explore relevant options">
    {doctor && <p className="service-context">Selected sample profile: <Link href={`/doctors/${doctor.slug}`}>{doctor.name}</Link>. This clinician is synthetic and is not assigned to a case.</p>}
    <div className="service-panel"><h2>Preparation here. Professional review with a clinician.</h2><p>MedBridge can organize a question and explicitly requested records. It does not diagnose or provide an opinion. A clinician must review and sign any final medical opinion.</p><ReportPicker /><Link className="text-link" href="/assistant?q=Help%20me%20organize%20documents%20for%20a%20second%20opinion">Organize requested documents in the workspace →</Link></div>
  </ServiceLanding>;
}
