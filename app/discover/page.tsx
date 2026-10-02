import { Suspense } from "react";
import { DiscoveryExperience } from "@/components/discovery/discovery-experience";
import { searchService } from "@/lib/discovery/search-service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Discover care options",
  description: "Explore MedBridge sample treatments, providers, packages, destinations and services with working search and filters.",
};

export default async function DiscoverPage() {
  const facets = await searchService.facets();
  return <Suspense fallback={<main id="main-content" tabIndex={-1} className="container state-page" role="status">Loading discovery…</main>}><DiscoveryExperience facets={facets} /></Suspense>;
}
