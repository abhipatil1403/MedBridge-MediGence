'use client';

import { T } from '@/components/experience/translation';
import { PageHeader } from "@/components/page-header";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getBrowserSupabaseClient } from '@/lib/supabase/browser';

export function AuthSuccess({ next }: { next: string }) {
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    let active = true;
    const failure = `/auth/failure?next=${encodeURIComponent(next)}`;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) { window.location.replace(failure); return; }

    const client = getBrowserSupabaseClient()!;
    void client.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error || !data.user) { window.location.replace(failure); return; }
      setVerified(true);
      timer = window.setTimeout(() => window.location.replace(next), 3000);
    }).catch(() => { if (active) window.location.replace(failure); });

    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [next]);

  return <main id="main-content" tabIndex={-1} className="auth-page container"><section className="auth-card" role="status">
    <PageHeader eyebrow="MEDBRIDGE ACCOUNT" title={verified ? 'You’re signed in' : 'Confirming your session'} compact />
    <p><T>{verified ? 'Your email link worked. We’ll take you back to where you started.' : 'Please wait while we verify your account.'}</T></p>
    {verified && <Link className="auth-card__action" href={next}><T>{"Continue now →"}</T></Link>}
  </section></main>;
}
