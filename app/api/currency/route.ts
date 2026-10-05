import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currencies } from '@/lib/experience/preferences';
import { convertPrice } from '@/lib/experience/currency';
import { exchangeRates } from '@/lib/experience/rates';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  const parsed = z.object({ from: z.string().regex(/^[A-Z]{3}$/), to: z.enum(currencies) }).safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'Unsupported currency.' }, { status: 400 });
  try {
    const quote = convertPrice(1, parsed.data.from, parsed.data.to, await exchangeRates());
    return NextResponse.json({ quote }, { headers: { 'Cache-Control': quote?.stale || !quote ? 'public, max-age=60' : 'public, max-age=900' } });
  } catch { return NextResponse.json({ quote: null }, { headers: { 'Cache-Control': 'public, max-age=60' } }); }
}
