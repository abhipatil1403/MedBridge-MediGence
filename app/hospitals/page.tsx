import { CatalogDirectory } from "@/components/catalog-directory";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Find hospitals",
  description:
    "Browse published provider profiles and clearly labeled synthetic examples.",
};
export default function HospitalsPage() {
  return (
    <CatalogDirectory
      type="hospitals"
      title="Find hospitals"
      description="Explore provider profiles by location, specialty and treatment. Check each listing�s source and evidence."
    />
  );
}
