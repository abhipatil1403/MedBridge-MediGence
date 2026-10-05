import { Suspense } from "react";
import { DiscoveryExperience } from "@/components/discovery/discovery-experience";
import { searchService } from "@/lib/discovery/search-service";
import { parseDiscoveryFilters } from '@/lib/discovery/filters';
import { RouteSkeleton } from '@/components/route-skeleton';

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Discover care options",
  description: "Explore published treatments, providers, packages, destinations and services with working search and filters.",
};

export default async function DiscoverPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const query=await searchParams;
  const params=new URLSearchParams(Object.entries(query).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
  const [facets,results]=await Promise.all([searchService.facets(),searchService.search(parseDiscoveryFilters(params))]);
  return <Suspense fallback={<RouteSkeleton kind="discover"/>}><DiscoveryExperience facets={facets} initialResults={results} initialQuery={params.toString()}/></Suspense>;
}
