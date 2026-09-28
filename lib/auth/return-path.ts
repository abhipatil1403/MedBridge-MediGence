const fallback = '/assistant';
const base = 'https://medbridge.local';

export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const target = new URL(value, base);
    if (target.origin !== base || target.pathname.startsWith('/auth/')) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch { return fallback; }
}
