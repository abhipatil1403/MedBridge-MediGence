import { T } from '@/components/experience/translation';
import type { Metadata } from "next";
import { ServiceLanding } from "@/components/service-landing";

export const dynamic = "force-dynamic";
import { detailMetadata } from "@/lib/seo";

export const metadata: Metadata = detailMetadata("Medical travel", "Understand the steps of coordinating travel around a treatment plan.", "/medical-travel");
export default function MedicalTravelPage() {
  return <ServiceLanding slug="medical-travel" title="Plan the practical side of your journey." intro="Keep the destination, care dates and support needs in view. Travel arrangements follow a confirmed care plan." nextHref="/compare" nextLabel="Compare destinations">
    <div className="service-panel"><h2><T>{"Before travel is arranged"}</T></h2><p><T>{"Confirm the treating provider, estimated stay, official visa requirements, companion needs, and what each vendor has actually confirmed. This preview makes no bookings or visa applications."}</T></p></div>
  </ServiceLanding>;
}
