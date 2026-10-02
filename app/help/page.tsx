import { Suspense } from "react";
import { PortalApp } from "@/components/portals/portal-app";
export const metadata = { title: "Support Requests" };
export default function Page() {
  return (
    <Suspense
      fallback={<main id="main-content">Loading support requests…</main>}
    >
      <PortalApp portal="patient" path={["cases"]} />
    </Suspense>
  );
}
