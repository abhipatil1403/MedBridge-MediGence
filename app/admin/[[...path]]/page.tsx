import { T } from '@/components/experience/translation';
import { Suspense } from "react";
import { PortalApp } from "@/components/portals/portal-app";
export const metadata = { title: "Admin Portal" };
export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path } = await params;
  return (
    <Suspense fallback={<main id="main-content"><T>{"Loading admin portal…"}</T></main>}>
      <PortalApp portal="admin" path={path} />
    </Suspense>
  );
}
