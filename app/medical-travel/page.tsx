import type { Metadata } from "next";
import { ServiceLanding } from "@/components/service-landing";
import { detailMetadata } from "@/lib/seo";

export const metadata: Metadata = detailMetadata("Medical travel", "Understand the steps of coordinating travel around a treatment plan.", "/medical-travel");
export default function MedicalTravelPage() {
  return <ServiceLanding slug="travel-coordination" title="Medical travel" intro="Travel planning follows a confirmed care plan. Keep visas, travel dates, stays, transfers and support needs in one timeline." nextHref="/compare" nextLabel="Compare destinations">
    <div className="service-panel"><h2>Before travel is arranged</h2><p>Confirm the treating provider, estimated stay, official visa requirements, companion needs, and what each vendor has actually confirmed. This preview makes no bookings or visa applications.</p></div>
  </ServiceLanding>;
}
