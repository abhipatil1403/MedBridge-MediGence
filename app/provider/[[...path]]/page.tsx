import { Suspense } from "react";
import { PortalApp } from "@/components/portals/portal-app";
export const metadata = { title: "Provider Portal" };
export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path } = await params;
  return (
    <Suspense
      fallback={<main id="main-content">Loading provider portal…</main>}
    >
      <PortalApp portal="provider" path={path} />
    </Suspense>
  );
}
