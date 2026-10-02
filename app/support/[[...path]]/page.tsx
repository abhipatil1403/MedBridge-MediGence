import { Suspense } from "react";
import { PortalApp } from "@/components/portals/portal-app";
export const metadata = { title: "Support Portal" };
export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path } = await params;
  return (
    <Suspense fallback={<main id="main-content">Loading support portal…</main>}>
      <PortalApp portal="support" path={path} />
    </Suspense>
  );
}
