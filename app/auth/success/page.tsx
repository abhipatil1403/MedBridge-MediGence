import type { Metadata } from 'next';
import { AuthSuccess } from '@/components/auth/auth-success';
import { safeReturnPath } from '@/lib/auth/return-path';

export const metadata: Metadata = { title: 'Sign-in successful' };

export default async function AuthSuccessPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthSuccess next={safeReturnPath(next)} />;
}
