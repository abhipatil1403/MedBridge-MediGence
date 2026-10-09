import { RouteSkeleton } from '@/components/route-skeleton';
import { Suspense } from "react";
import { PortalApp } from "@/components/portals/portal-app";
import { getPackageDetail } from '@/lib/catalog/detail-service';
import { redirect } from 'next/navigation';
export const metadata = { title: "Support Requests" };
export default async function Page({searchParams}: {searchParams:Promise<{package?:string}>}) {
  const query=await searchParams;
  const detail=typeof query.package==='string' && query.package.length<=200 ? await getPackageDetail(query.package) : null;
  if(detail)redirect(`/request-assistance?kind=package&entityId=${detail.carePackage.recordId}&source=package_detail`);
  return (
    <Suspense
      fallback={<RouteSkeleton kind="help"/>}
    >
      <PortalApp portal="patient" path={["cases"]}/>
    </Suspense>
  );
}
