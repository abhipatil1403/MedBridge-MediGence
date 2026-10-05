import { T } from '@/components/experience/translation';
import { Suspense } from "react";
import { PortalApp } from "@/components/portals/portal-app";
import { getPackageDetail } from '@/lib/catalog/detail-service';
export const metadata = { title: "Support Requests" };
export default async function Page({searchParams}: {searchParams:Promise<{package?:string}>}) {
  const query=await searchParams;
  const detail=typeof query.package==='string' && query.package.length<=200 ? await getPackageDetail(query.package) : null;
  const packageInquiry=detail ? {title:detail.carePackage.name,hospitalId:detail.hospital?.recordId,
    description:`Package: ${detail.carePackage.name}\nProvider: ${detail.hospital?.name ?? detail.carePackage.hospitalName}\nLocation: ${[detail.carePackage.city, detail.country?.name].filter(Boolean).join(', ') || 'Not published'}\nTreatment: ${detail.treatment?.name ?? detail.carePackage.treatmentSlug}\nPublished package revision: ${detail.carePackage.publishedRevision ?? 'Not available'}\nCatalog: https://medbridge-medigence.vercel.app/packages/${detail.carePackage.slug}\nSource: ${detail.carePackage.provenance?.sourceUrl ?? 'Published provider information'}\n\nMy question: `} : undefined;
  return (
    <Suspense
      fallback={<main id="main-content"><T>{"Loading support requests…"}</T></main>}
    >
      <PortalApp portal="patient" path={["cases"]} packageInquiry={packageInquiry}/>
    </Suspense>
  );
}
