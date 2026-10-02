'use client';
import { PageHeader } from "@/components/page-header";

import { useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { safeReturnPath } from '@/lib/auth/return-path';

export function AuthCallback() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function completeSignIn() {
      const query = new URLSearchParams(window.location.search);
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const next = safeReturnPath(query.get('next'));
      const destination = (status: 'success' | 'failure') => `/auth/${status}?next=${encodeURIComponent(next)}`;
      const accessToken = fragment.get('access_token') ?? query.get('access_token');
      const refreshToken = fragment.get('refresh_token') ?? query.get('refresh_token');
      const code = query.get('code');
      const hasAuthError = Boolean(fragment.get('error') || fragment.get('error_code') || query.get('error') || query.get('error_code'));

      // Keep the return destination but remove one-time credentials from browser history.
      window.history.replaceState(null, '', `/auth/callback?next=${encodeURIComponent(next)}`);
      if (hasAuthError || (!code && !(accessToken && refreshToken))) {
        window.location.replace(destination('failure'));
        return;
      }

      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) {
        window.location.replace(destination('failure'));
        return;
      }

      try {
        const client = createClient(url, key, { auth: { detectSessionInUrl: false, persistSession: true } });
        const result = accessToken && refreshToken
          ? await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          : await client.auth.exchangeCodeForSession(code!);
        window.location.replace(destination(!result.error && result.data.session ? 'success' : 'failure'));
      } catch {
        window.location.replace(destination('failure'));
      }
    }

    void completeSignIn();
  }, []);

  return <main id="main-content" tabIndex={-1} className="auth-page container"><section className="auth-card" role="status">
    <PageHeader eyebrow="MEDBRIDGE ACCOUNT" title="Checking your sign-in link" compact />
    <p>Please wait while we finish signing you in.</p>
  </section></main>;
}
