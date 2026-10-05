import { CatalogDirectory } from "@/components/catalog-directory";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Find hospitals",
  description:
    "Browse reviewed, published provider profiles by location and specialty.",
};
export default function HospitalsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  return (
    <CatalogDirectory
      searchParams={searchParams}
      type="hospitals"
      title="Find hospitals"
      description="Explore published provider profiles by location, specialty and treatment. Check each listing's source and evidence."
    />
  );
}
