import { T } from '@/components/experience/translation';
import { Suspense } from "react";
import { PortalApp } from "@/components/portals/portal-app";
export const metadata = { title: "Support Requests" };
export default function Page() {
  return (
    <Suspense
      fallback={<main id="main-content"><T>{"Loading support requests…"}</T></main>}
    >
      <PortalApp portal="patient" path={["cases"]} />
    </Suspense>
  );
}
