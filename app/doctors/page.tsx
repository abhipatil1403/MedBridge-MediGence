import { CatalogDirectory } from "@/components/catalog-directory";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Find doctors",
  description:
    "Explore clinician profiles with source labels and consultation information.",
};
export default function DoctorsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  return (
    <CatalogDirectory
      searchParams={searchParams}
      type="doctors"
      title="Find doctors"
      description="Review specialties, languages, consultation modes and the evidence behind each profile."
    />
  );
}
