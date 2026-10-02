'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null | undefined;

/** One auth subscription source per page; callback credentials are handled explicitly. */
export function getBrowserSupabaseClient() {
  if (browserClient !== undefined) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  browserClient = url && key ? createClient(url, key, { auth: { detectSessionInUrl: false, persistSession: true } }) : null;
  return browserClient;
}
