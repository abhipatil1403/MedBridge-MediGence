"use client";
import { T, LocalDate } from '@/components/experience/translation';
import { packageServiceNames } from '@/lib/catalog/package-services';
import { packagePrice, priceTypeLabels } from '@/lib/catalog/pricing';
import type { Row } from '@/lib/portals/config';
import { useResource } from './core';

export function PackageReview({ row }: { row: Row }) {
  const data = row.data ?? {};
  const organizationId = String(row.organization_id ?? '');
  const treatments = useResource<{rows: Row[]}>('treatments', {size:'200'});
  const locations = useResource<{rows: Row[]}>('provider_records', {organizationId,kind:'location',size:'200'});
  const profiles = useResource<{rows: Row[]}>('provider_records', {organizationId,kind:'organization',size:'1'});
  const treatment = treatments.data?.rows.find(item => item.id === data.treatmentId);
  const location = locations.data?.rows.find(item => item.id === data.locationId);
  return <section className="portal-package-review" aria-label="Package pricing and services">
    <h3><T>{'Package pricing and services'}</T></h3>
    <dl className="portal-facts">
      <div><dt><T>{'Provider'}</T></dt><dd>{profiles.data?.rows[0]?.name ? String(profiles.data.rows[0].name) : <T>{'Loading provider…'}</T>}</dd></div>
      <div><dt><T>{'Treatment'}</T></dt><dd>{treatment?.name ? String(treatment.name) : <T>{'Not provided'}</T>}</dd></div>
      <div><dt><T>{'Package location'}</T></dt><dd>{location?.name ? String(location.name) : <T>{'Published organization location'}</T>}</dd></div>
      <div><dt><T>{'Original provider price'}</T></dt><dd>{packagePrice({listedPrice: typeof data.price === 'number' ? data.price : undefined,listedPriceMax:typeof data.priceMax==='number'?data.priceMax:undefined,currency:typeof data.currency==='string'?data.currency:undefined,priceType:String(data.priceType ?? 'estimate')})}</dd></div>
      <div><dt><T>{'Pricing type'}</T></dt><dd><T>{priceTypeLabels[String(data.priceType ?? 'estimate')] ?? 'Not provided'}</T></dd></div>
      <div><dt><T>{'Duration'}</T></dt><dd>{data.durationDays ? `${data.durationDays} days` : <T>{'Not provided'}</T>}</dd></div>
      <div><dt><T>{'Price source'}</T></dt><dd>{data.priceSourceUrl ? <a href={String(data.priceSourceUrl)} target="_blank" rel="noreferrer">{String(data.priceSourceName ?? data.priceSourceUrl)}</a> : <T>{'Review the field evidence or supporting documents below'}</T>}</dd></div>
      <div><dt><T>{'Price source checked'}</T></dt><dd>{typeof data.priceCheckedAt === 'string' ? <LocalDate value={data.priceCheckedAt}/> : <T>{'Not provided'}</T>}</dd></div>
    </dl>
    <dl className="portal-facts">{Object.entries(packageServiceNames).map(([key,name]) => <div key={key}><dt><T>{name}</T></dt><dd><T>{data[`${key}Status`] === 'included' ? 'Included' : data[`${key}Status`] === 'excluded' ? 'Not included' : data[`${key}Status`] === 'conditional' ? 'Available subject to conditions' : 'Not confirmed by provider'}</T>{Boolean(data[`${key}Info`]) && <p>{String(data[`${key}Info`])}</p>}</dd></div>)}</dl>
    <p className="portal-muted"><T>{'Review each provided package field against a relevant source or approved document. Missing amounts, duration and services must remain unconfirmed. Hospital stay is not accommodation; visa assistance is not visa approval.'}</T></p>
  </section>;
}
