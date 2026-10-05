import { CatalogDirectory } from "@/components/catalog-directory";

export const dynamic = "force-dynamic";

export const metadata = { title: "Explore treatments", description: "Browse reviewed, published treatment information and continue to care discovery." };
export default function TreatmentsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) { return <CatalogDirectory searchParams={searchParams}
      type="treatments" title="Explore treatments" description="Understand treatment categories, then compare destinations and related care options." />; }
