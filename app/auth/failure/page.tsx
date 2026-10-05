import { T } from '@/components/experience/translation';
import { PageHeader } from "@/components/page-header";
import type { Metadata } from 'next';
import Link from 'next/link';
import { safeReturnPath } from '@/lib/auth/return-path';

export const metadata: Metadata = { title: 'Sign-in link did not work' };

export default async function AuthFailurePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <main id="main-content" tabIndex={-1} className="auth-page container"><section className="auth-card" role="alert">
    <PageHeader eyebrow="MEDBRIDGE ACCOUNT" title="Sign-in link did not work" compact />
    <p><T>{"The link may have expired or already been used. Return to the page you were on and request a new link."}</T></p>
    <Link className="auth-card__action" href={safeReturnPath(next)}><T>{"Return and try again →"}</T></Link>
  </section></main>;
}
