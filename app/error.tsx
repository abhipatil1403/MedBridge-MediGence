"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main id="main-content" className="container state-page" role="alert"><p className="eyebrow">SOMETHING WENT WRONG</p><h1>We couldn’t load this page.</h1><p>Please try again. If the problem continues, return later.</p><button className="button button--primary button--default" type="button" onClick={reset}>Try again</button></main>;
}
