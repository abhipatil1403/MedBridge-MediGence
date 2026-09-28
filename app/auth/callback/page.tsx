import type { Metadata } from 'next';
import { AuthCallback } from '@/components/auth/auth-callback';

export const metadata: Metadata = { title: 'Finishing sign-in' };

export default function AuthCallbackPage() {
  return <AuthCallback />;
}
