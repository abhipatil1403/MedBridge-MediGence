import type { Package } from '@/types/catalog';
export function packagePrice(item:Pick<Package,'samplePriceUsd'|'listedPrice'|'currency'>) {
  return `${item.currency??'USD'} ${(item.listedPrice??item.samplePriceUsd).toLocaleString('en-US')}`;
}
