import { PageHeader } from "@/components/page-header";
import Link from "next/link";

export default function NotFound() {
  return <main id="main-content" tabIndex={-1} className="container state-page"><PageHeader eyebrow="PAGE NOT FOUND" title="We couldn’t find that page." /><p>The address may have changed, or this part of MedBridge may still be in development.</p><Link className="text-link" href="/">Return home →</Link></main>;
}
