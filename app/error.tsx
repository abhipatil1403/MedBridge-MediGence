"use client";
import { PageHeader } from "@/components/page-header";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main id="main-content" tabIndex={-1} className="container state-page" role="alert"><PageHeader eyebrow="SOMETHING WENT WRONG" title="We couldn’t load this page." /><p>Please try again. If the problem continues, return later.</p><button className="button button--primary button--default" type="button" onClick={reset}>Try again</button></main>;
}
