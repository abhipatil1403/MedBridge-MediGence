import { T } from '@/components/experience/translation';
import { PageHeader } from "@/components/page-header";
import Link from "next/link";

export default function NotFound() {
  return <main id="main-content" tabIndex={-1} className="container state-page"><PageHeader eyebrow="PAGE NOT FOUND" title="We couldn’t find that page." /><p><T>{"The address may have changed, or this part of MedBridge may still be in development."}</T></p><Link className="text-link" href="/"><T>{"Return home →"}</T></Link></main>;
}
