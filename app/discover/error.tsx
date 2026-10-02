"use client";
import { PageHeader } from "@/components/page-header";

export default function DiscoveryError({ reset }: { error: Error; reset: () => void }) {
  return <main id="main-content" tabIndex={-1} className="container state-page" role="alert"><PageHeader eyebrow="SEARCH UNAVAILABLE" title="We couldn’t load discovery." /><p>Your search can be retried without entering it again.</p><button className="button button--primary button--default" type="button" onClick={reset}>Retry</button></main>;
}
