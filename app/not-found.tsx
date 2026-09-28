import Link from "next/link";

export default function NotFound() {
  return <main id="main-content" className="container state-page"><p className="eyebrow">PAGE NOT FOUND</p><h1>We couldn’t find that page.</h1><p>The address may have changed, or this part of MedBridge may still be in development.</p><Link className="text-link" href="/">Return home →</Link></main>;
}
