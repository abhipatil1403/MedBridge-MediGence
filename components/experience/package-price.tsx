"use client";
import { Price } from './price';
import { T } from './translation';
import { packagePriceBounds, priceIsCurrent, priceTypeLabels, type PackagePriceInput } from '@/lib/catalog/pricing';

export function PackagePrice({ item }: { item: PackagePriceInput }) {
  const price = packagePriceBounds(item);
  return <span className="package-price-display">
    {!price ? <T>{priceTypeLabels[item.priceType ?? 'not_published'] ?? 'Price not published'}</T> : <>
      {price.type === 'starting_price' && <><T>{'From'}</T>{' '}</>}
      <Price amount={price.min} currency={price.currency}/>
      {price.max !== price.min && <>{' – '}<Price amount={price.max} currency={price.currency}/></>}
    </>}
    {price && !priceIsCurrent(item) && <small><T>{'Pricing needs current provider confirmation'}</T></small>}
  </span>;
}
