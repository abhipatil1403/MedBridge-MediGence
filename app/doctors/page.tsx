import { CatalogDirectory } from "@/components/catalog-directory";

export const metadata = { title: "Find doctors", description: "Browse clearly marked sample clinician profiles and consultation pathways." };
export default function DoctorsPage() { return <CatalogDirectory type="doctors" title="Find doctors" description="Review sample specialties, languages and consultation modes before continuing." />; }
