import { CatalogDirectory } from "@/components/catalog-directory";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Explore packages",
  description:
    "Compare package estimates, currencies, inclusions and exclusions.",
};
export default function PackagesPage() {
  return (
    <CatalogDirectory
      type="packages"
      title="Explore packages"
      description="Inspect listed currencies, estimates, inclusions and exclusions. Confirm current prices with the provider."
    />
  );
}
