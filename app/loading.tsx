import { PageHeader } from "@/components/page-header";
export default function Loading() {
  return <main id="main-content" tabIndex={-1} className="container state-page" role="status" aria-live="polite"><PageHeader eyebrow="MEDBRIDGE" title="Loading your page…" /></main>;
}
