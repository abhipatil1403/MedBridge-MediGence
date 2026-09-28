"use client";

export default function DiscoveryError({ reset }: { error: Error; reset: () => void }) {
  return <main id="main-content" className="container state-page" role="alert"><p className="eyebrow">SEARCH UNAVAILABLE</p><h1>We couldn’t load discovery.</h1><p>Your search can be retried without entering it again.</p><button className="button button--primary button--default" type="button" onClick={reset}>Retry</button></main>;
}
