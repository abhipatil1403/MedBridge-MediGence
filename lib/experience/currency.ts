import { z } from 'zod';
import type { Currency } from './preferences';
export const rateSnapshotSchema = z.object({
  base: z.literal('USD'), rates: z.record(z.string().regex(/^[A-Z]{3}$/), z.number().finite().positive()),
  source: z.literal('https://www.exchangerate-api.com'),
  updatedAt: z.iso.datetime(), fetchedAt: z.iso.datetime(), expiresAt: z.iso.datetime(),
});
export type RateSnapshot = z.infer<typeof rateSnapshotSchema>;
export type Conversion = { amount: number; originalAmount: number; originalCurrency: string; currency: Currency; rate: number; source: string; updatedAt: string; fetchedAt: string; expiresAt: string; stale: boolean };
export function convertPrice(amount: number, original: string, target: Currency, snapshot: RateSnapshot | null, now = Date.now()): Conversion | null {
  if (!Number.isFinite(amount) || amount < 0 || original === target || !snapshot) return null;
  const from = snapshot.rates[original], to = snapshot.rates[target];
  if (!from || !to) return null;
  // Round only the presentation amount. Canonical prices and source currency remain intact.
  const rate = to / from;
  const converted = amount * rate;
  if (!Number.isFinite(converted)) return null;
  return { amount: converted, originalAmount: amount, originalCurrency: original, currency: target,
    rate, source: snapshot.source, updatedAt: snapshot.updatedAt, fetchedAt: snapshot.fetchedAt, expiresAt: snapshot.expiresAt,
    stale: now >= Date.parse(snapshot.expiresAt) };
}
export function parseRateProvider(raw: unknown, now = Date.now()): RateSnapshot {
  const data = z.object({ result: z.literal('success'), provider: z.literal('https://www.exchangerate-api.com'),
    base_code: z.literal('USD'), rates: rateSnapshotSchema.shape.rates,
    time_last_update_unix: z.number().int().positive(), time_next_update_unix: z.number().int().positive(),
  }).parse(raw);
  const updated = data.time_last_update_unix * 1000, expires = data.time_next_update_unix * 1000;
  if (updated > now + 300_000 || expires <= updated || expires - updated > 48 * 3600_000 || data.rates.USD !== 1) throw new Error('Invalid exchange-rate timestamp or base.');
  return rateSnapshotSchema.parse({ base: 'USD', rates: data.rates, source: data.provider,
    updatedAt: new Date(updated).toISOString(), fetchedAt: new Date(now).toISOString(), expiresAt: new Date(expires).toISOString() });
}
