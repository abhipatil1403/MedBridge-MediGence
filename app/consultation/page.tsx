import { T } from '@/components/experience/translation';
import type { Metadata } from "next";
import Link from "next/link";
import { ServiceLanding } from "@/components/service-landing";
import { getDoctorBySlug } from "@/lib/catalog/repository";
import { detailMetadata } from "@/lib/seo";

export const metadata: Metadata = detailMetadata("Video consultation", "Explore the steps toward a remote specialist consultation.", "/consultation");
export default async function ConsultationPage({ searchParams }: { searchParams: Promise<{ doctor?: string }> }) {
  const { doctor: slug } = await searchParams;
  const doctor = slug ? await getDoctorBySlug(slug) : undefined;
  return <ServiceLanding slug="video-consultation" title="Video consultation" intro="Find a specialist, review the consultation pathway, and prepare the information a real appointment would need." nextHref="/discover?type=doctors" nextLabel="Find sample clinicians">
    {doctor && <div className="service-panel"><p className="eyebrow"><T>{"SELECTED PROFILE"}</T></p><h2>{doctor.name}</h2><p>{doctor.specialty} · {doctor.hospitalName} · {doctor.city}<T>{". This is a synthetic profile. No live slot or booking exists."}</T></p><Link className="text-link" href={`/doctors/${doctor.slug}`}><T>{"Return to profile →"}</T></Link></div>}
  </ServiceLanding>;
}
