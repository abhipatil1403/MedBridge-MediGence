import { CatalogDirectory } from "@/components/catalog-directory";

export const dynamic = "force-dynamic";

export const metadata = { title: "Find hospitals", description: "Browse clearly marked sample hospitals and explore relevant care options." };
export default function HospitalsPage() { return <CatalogDirectory type="hospitals" title="Find hospitals" description="Explore sample provider profiles by location, specialty and treatment." />; }
