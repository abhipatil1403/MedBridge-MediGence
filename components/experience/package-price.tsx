"use client";
import { Price } from './price';
import { T } from './translation';
import { packagePriceBounds, priceIsCurrent, priceTypeLabels, type PackagePriceInput } from '@/lib/catalog/pricing';

export function PackagePrice({ item,compact=false }: { item: PackagePriceInput;compact?:boolean }) {
  const price = packagePriceBounds(item);
  return <span className="package-price-display">
    {!price ? <T>{priceTypeLabels[item.priceType ?? 'not_published'] ?? 'Price not published'}</T> : <>
      {price.type === 'starting_price' && <><T>{'From'}</T>{' '}</>}
      <Price amount={price.min} currency={price.currency} compact={compact}/>
      {price.max !== price.min && <>{' – '}<Price amount={price.max} currency={price.currency} compact={compact}/></>}
    </>}
    {price && !priceIsCurrent(item) && <small><T>{'Pricing needs current provider confirmation'}</T></small>}
  </span>;
}
