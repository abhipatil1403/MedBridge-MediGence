import type { ReactNode } from 'react';
import Link from '@/components/catalog-link';
import { T, LocalNumber } from '@/components/experience/translation';
import { LocationObject, PriceBlock, ServiceCapsules } from './semantic';
import { packageServiceNames } from '@/lib/catalog/package-services';
import type { Package } from '@/types/catalog';

/** Factor labels and option identity remain readable when columns stack. */
export function PackageComparison({ items }: { items: readonly Package[] }) {
  function factor(label: string, value: (item: Package) => ReactNode, emphasis = false) {
    return <section className={`comparison-factor${emphasis ? ' comparison-factor--price' : ''}`} key={label}>
      <h3><T>{label}</T></h3>{items.map(item => <div className="comparison-value" role="group" aria-label={item.name} key={item.recordId}>
        <strong className="comparison-value__identity">{item.name}</strong>{value(item)}
      </div>)}
    </section>;
  }
  return <details className="comparison-package-matrix" suppressHydrationWarning>
    <summary><T>{'Compare these packages'}</T></summary>
    <p className="comparison-caption"><T>{'Published information for planning questions only'}</T></p>
    <div className="comparison-factors"><div className="comparison-heading"><span><T>{'Factor'}</T></span>{items.map(item=><strong key={item.recordId}>{item.name}</strong>)}</div>
      {factor('Original provider price', item => <PriceBlock compact item={item} sample={item.demo}/>, true)}
      {factor('Provider', item => <p>{item.hospitalName}</p>)}
      {factor('Location', item => <LocationObject city={item.city} country={item.country}/>)}
      {(['inclusions', 'exclusions'] as const).map(key => factor(key === 'inclusions' ? "What's included" : "What's excluded", item => item[key].length ? <><ServiceCapsules values={item[key].slice(0,5)} status={key === 'inclusions' ? 'included' : 'excluded'}/>{item[key].length > 5 && <Link href={`/packages/${item.slug}`}><T>{'View package'}</T> →</Link>}</> : <p><T>{'Not provided in published package information.'}</T></p>))}
      {factor('Duration', item => <p>{item.durationDays > 0 ? <><LocalNumber value={item.durationDays}/> <T>{'days'}</T></> : <T>{'Duration not published'}</T>}</p>)}
      {(['accommodation', 'transfer', 'rehabilitation'] as const).map(key => factor(packageServiceNames[key], item => {
        const service = item.serviceDetails?.[key];
        return <div className="comparison-service" data-service-status={service?.status ?? 'not_confirmed'}><strong><T>{service?.status === 'included' ? 'Included in the published package.' : service?.status === 'excluded' ? 'Excluded from the published package.' : service?.status === 'conditional' ? 'Conditional; confirm the published limits with the provider.' : 'Not confirmed in published package information.'}</T></strong>{service?.information && <p>{service.information}</p>}</div>;
      }))}
      {factor('Evidence and sources', item => <Link className="text-link" href={`/packages/${item.slug}#evidence`}><T>{'View evidence and full details'}</T> →</Link>)}
    </div><p><T>{'This listing is not a current quote, reservation or clinical recommendation. Additional costs may apply.'}</T></p>
  </details>;
}
