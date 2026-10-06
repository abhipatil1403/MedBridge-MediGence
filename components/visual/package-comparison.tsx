import Link from '@/components/catalog-link';
import { T } from '@/components/experience/translation';
import { Localized } from '@/components/experience/localized';
import { PackagePrice } from '@/components/experience/package-price';
import { packageServiceNames } from '@/lib/catalog/package-services';
import type { Package } from '@/types/catalog';

/** Compare published fields without selecting a winner or inferring suitability. */
export function PackageComparison({ items }: { items: readonly Package[] }) {
  // Native toggles can change `open` before React hydrates; retain that user choice.
  return <details className="comparison-package-matrix" suppressHydrationWarning><summary><T>{'Compare these packages'}</T></summary>
    <Localized as="div" className="comparison-package-matrix__scroll" role="region" tabIndex={0} aria-label="Package comparison">
      <table><caption><T>{'Published information for planning questions only'}</T></caption><thead><tr><th scope="col"><T>{'Factor'}</T></th>{items.map(item=><th scope="col" key={item.recordId}>{item.name}</th>)}</tr></thead><tbody>
        <tr><th scope="row"><T>{'Original provider price'}</T></th>{items.map(item=><td key={item.recordId}><PackagePrice item={item} compact/></td>)}</tr>
        {(['inclusions','exclusions'] as const).map(key=><tr key={key}><th scope="row"><T>{key==='inclusions'?"What's included":"What's excluded"}</T></th>{items.map(item=><td key={item.recordId}>{item[key].length?<><ul>{item[key].slice(0,5).map(fact=><li key={fact}>{fact}</li>)}</ul>{item[key].length>5&&<Link href={`/packages/${item.slug}`}><T>{'View package'}</T> →</Link>}</>:<T>{'Not provided in published package information.'}</T>}</td>)}</tr>)}
        <tr><th scope="row"><T>{'Duration'}</T></th>{items.map(item=><td key={item.recordId}>{item.durationDays>0?<>{item.durationDays} <T>{'days'}</T></>:<T>{'Duration not published'}</T>}</td>)}</tr>
        {(['accommodation','transfer','rehabilitation'] as const).map(key=><tr key={key}><th scope="row"><T>{packageServiceNames[key]}</T></th>{items.map(item=>{const service=item.serviceDetails?.[key];return <td key={item.recordId}><T>{service?.status==='included'?'Included in the published package.':service?.status==='excluded'?'Excluded from the published package.':service?.status==='conditional'?'Conditional; confirm the published limits with the provider.':'Not confirmed in published package information.'}</T>{service?.information&&<p>{service.information}</p>}</td>;})}</tr>)}
        <tr><th scope="row"><T>{'Evidence and sources'}</T></th>{items.map(item=><td key={item.recordId}><Link className="text-link" href={`/packages/${item.slug}#evidence`}><T>{'View package'}</T> →</Link></td>)}</tr>
      </tbody></table>
    </Localized><p><T>{'This listing is not a current quote, reservation or clinical recommendation. Additional costs may apply.'}</T></p>
  </details>;
}
