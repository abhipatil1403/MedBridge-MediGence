import { convertPrice, type RateSnapshot } from '@/lib/experience/currency';
import { currencies, type Currency } from '@/lib/experience/preferences';

export type PackagePriceInput = {
  listedPrice?: number | null; listedPriceMax?: number | null; samplePriceUsd?: number;
  currency?: string | null; priceType?: string; priceValidFrom?: string; priceValidUntil?: string;
};
export const priceTypeLabels: Record<string, string> = {
  package_price: 'Package price', published_price: 'Published price', estimate: 'Provider-listed estimate',
  starting_price: 'Starting price', contact_provider: 'Contact provider for pricing', not_published: 'Price not published',
  historical: 'Historical price', quoted: 'Listed quote; confirm applicability',
};
export function packagePriceBounds(item: PackagePriceInput) {
  if (['contact_provider', 'not_published'].includes(item.priceType ?? '')) return null;
  const min = item.listedPrice ?? (item.samplePriceUsd && item.samplePriceUsd > 0 ? item.samplePriceUsd : undefined);
  const max = item.listedPriceMax ?? min;
  const currency = item.currency ?? (item.samplePriceUsd && item.samplePriceUsd > 0 ? 'USD' : undefined);
  if (typeof min !== 'number' || typeof max !== 'number' || !Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min || !currency || !/^[A-Z]{3}$/.test(currency)) return null;
  return { min, max, currency, type: item.priceType ?? 'estimate' };
}
export function priceIsCurrent(item: PackagePriceInput, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return item.priceType !== 'historical' && (!item.priceValidFrom || item.priceValidFrom <= today) && (!item.priceValidUntil || item.priceValidUntil >= today);
}
export function packagePrice(item: PackagePriceInput) {
  const price = packagePriceBounds(item);
  if (!price) return priceTypeLabels[item.priceType ?? 'not_published'] ?? 'Price not published';
  return `${price.type === 'starting_price' ? 'From ' : ''}${price.currency} ${price.min.toLocaleString('en-US')}${price.max !== price.min ? `–${price.max.toLocaleString('en-US')}` : ''}`;
}
export function packageDisplayPrice(item: PackagePriceInput) {
  const price = packagePriceBounds(item);
  if (!price) return packagePrice(item);
  const format = new Intl.NumberFormat('en-IN',{style:'currency',currency:price.currency,maximumFractionDigits:2,minimumFractionDigits:0});
  return `${price.type === 'starting_price' ? 'From ' : ''}${format.format(price.min)}${price.max !== price.min ? `–${format.format(price.max)}` : ''}`;
}
export function factsPrice(facts: Record<string, string | number | null>): PackagePriceInput {
  return { listedPrice: typeof facts.listedPrice === 'number' ? facts.listedPrice : undefined,
    listedPriceMax: typeof facts.listedPriceMax === 'number' ? facts.listedPriceMax : undefined,
    samplePriceUsd: typeof facts.samplePriceUsd === 'number' ? facts.samplePriceUsd : undefined,
    currency: typeof facts.currency === 'string' ? facts.currency : undefined,
    priceType: typeof facts.priceType === 'string' ? facts.priceType : undefined,
    priceValidFrom: typeof facts.priceValidFrom === 'string' ? facts.priceValidFrom : undefined,
    priceValidUntil: typeof facts.priceValidUntil === 'string' ? facts.priceValidUntil : undefined };
}
export function comparisonPrice(item: PackagePriceInput, target: string, snapshot?: RateSnapshot | null) {
  const price = packagePriceBounds(item);
  if (!price || !priceIsCurrent(item)) return null;
  if (price.currency === target) return { ...price, note: '' };
  if (!(currencies as readonly string[]).includes(target)) return null;
  if (!snapshot || Date.now() - Date.parse(snapshot.updatedAt) > 7 * 86400_000 || Date.parse(snapshot.updatedAt) > Date.now() + 300_000) return null;
  const min = convertPrice(price.min, price.currency, target as Currency, snapshot);
  const max = convertPrice(price.max, price.currency, target as Currency, snapshot);
  if (!min || !max) return null;
  return { min: price.min * min.rate, max: price.max * max.rate, currency: target, type: price.type,
    note: `Indicative conversion from ${packagePrice(item)} at ${min.rate.toPrecision(8)}; ${snapshot.source}, rate updated ${snapshot.updatedAt}${min.stale ? ' (stale cached rate)' : ''}. This is not a provider quote.` };
}
export function lowestComparablePrice(items: PackagePriceInput[], rates?: RateSnapshot | null) {
  const target = packagePriceBounds(items[0] ?? {})?.currency ?? 'USD';
  const prices = items.map(item=>comparisonPrice(item,target,rates));
  const count=prices.filter(Boolean).length;
  if (!items.length || prices.some(price=>!price)) return {index:null,reason:`${count} of ${items.length} packages have comparable current numeric prices. Missing prices cannot be ranked; a cheapest package cannot be determined.`};
  if (prices.some(price=>price!.type==='starting_price')) return {index:null,reason:'Starting prices are lower bounds, not complete package totals. A cheapest package cannot be determined.'};
  const best=Math.min(...prices.map(price=>price!.max));
  const candidates=prices.map((price,index)=>({price:price!,index})).filter(item=>item.price.max===best);
  if (candidates.length!==1) return {index:null,reason:'Published price values are tied; no unique lowest-priced package is established.'};
  const winner=candidates[0];
  if (prices.some((price,index)=>index!==winner.index && price!.min<best)) return {index:null,reason:'Published price ranges overlap; no unique lowest-priced package is established.'};
  return {index:winner.index,reason:`${items.length===1?'This is the only returned package with a published numeric price':'This package has the lowest listed price among the returned comparable records'}. ${winner.price.note} This does not establish suitability, equal inclusions or a current provider quote.`};
}
