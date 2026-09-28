import type { Metadata } from "next";
import { ServiceLanding } from "@/components/service-landing";

export const dynamic = "force-dynamic";
import { detailMetadata } from "@/lib/seo";

export const metadata: Metadata = detailMetadata("Recovery support", "Explore rehabilitation and follow-up as part of a connected care journey.", "/recovery");
export default function RecoveryPage() {
  return <ServiceLanding slug="recovery-planning" title="Recovery support" intro="Plan for rehabilitation, follow-up and local handover after treatment, with a clinician-approved plan at the center." nextHref="/discover?q=physiotherapy%20after%20surgery" nextLabel="Explore recovery options">
    <div className="service-panel"><h2>Care continues after discharge</h2><p>A real recovery plan needs clinical approval and a named care team. Check-ins and reminders should reflect that plan, not invented progress or automated medical advice.</p></div>
  </ServiceLanding>;
}
