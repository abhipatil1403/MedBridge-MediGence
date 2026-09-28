import type { Metadata } from 'next';
import Link from 'next/link';
import { safeReturnPath } from '@/lib/auth/return-path';

export const metadata: Metadata = { title: 'Sign-in link did not work' };

export default async function AuthFailurePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <main id="main-content" className="auth-page container"><section className="auth-card" role="alert">
    <p className="eyebrow">MEDBRIDGE ACCOUNT</p><h1>Sign-in link did not work</h1>
    <p>The link may have expired or already been used. Return to the page you were on and request a new link.</p>
    <Link className="auth-card__action" href={safeReturnPath(next)}>Return and try again →</Link>
  </section></main>;
}
