import {Suspense} from 'react';
import type {Metadata} from 'next';
import Link from '@/components/catalog-link';
import {notFound} from 'next/navigation';
import {T,LocalDate,LocalNumber} from '@/components/experience/translation';
import {SaveButton} from '@/components/experience/saved';
import {PriceBlock,ServiceCapsules} from '@/components/visual/semantic';
import {Breadcrumbs} from '@/components/breadcrumbs';
import {DetailHero,DetailNavigation,DetailSection} from '@/components/detail-parts';
import {CatalogProvenance} from '@/components/catalog-provenance';
import {getPackageDetail} from '@/lib/catalog/detail-service';
import {publishedRecordProfile,publishedPackageEvidence} from '@/lib/catalog/provider-profile';
import {fieldLabel} from '@/lib/catalog/field-label';
import {packageServiceNames} from '@/lib/catalog/package-services';
import {priceTypeLabels} from '@/lib/catalog/pricing';
import {detailMetadata} from '@/lib/seo';
import type {Package} from '@/types/catalog';
type Props={params:Promise<{slug:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{const {slug}=await params;const data=await getPackageDetail(slug);return data?detailMetadata(data.carePackage.name,data.carePackage.description,`/packages/${slug}`):{};}
async function PackageEvidence({id}:{id:string}){
 const [profile,evidence]=await Promise.all([publishedRecordProfile('package',id),publishedPackageEvidence(id)]);
 return <><DetailSection title="Validity and terms"><p>{profile?.validFrom??'Start date not provided'} → {profile?.validUntil??'End date not provided'}</p><p>{profile?.terms??'Confirm terms with the provider.'}</p>{profile?.notes&&<p>{profile.notes}</p>}</DetailSection>{evidence.length>0&&<details className="detail-section"><summary><T>{'Reviewed package evidence'}</T></summary><ul className="reference-public-sources">{evidence.map(item=><li key={item.field}><strong>{fieldLabel(item.field)}</strong>{' · '}{item.status}{' · '}<LocalDate value={item.checkedAt}/>{item.sourceUrl&&<>{' · '}<a href={item.sourceUrl} target="_blank" rel="noreferrer"><T>{'Public source'}</T></a></>}</li>)}</ul></details>}</>;
}
function PackageServices({item}:{item:Package}){
 const entries=Object.entries(packageServiceNames).map(([key,name])=>({key,name,service:item.serviceDetails?.[key as keyof typeof packageServiceNames]}));
 const known=entries.filter(entry=>entry.service&&entry.service.status!=='not_confirmed');const unknown=entries.filter(entry=>!entry.service||entry.service.status==='not_confirmed');
 return <DetailSection title="Package services">{known.length>0&&<dl className="fact-list package-service-facts">{known.map(({key,name,service})=><div key={key} data-service-status={service?.status}><dt><T>{name}</T></dt><dd><strong><T>{service?.status==='conditional'?'Conditional; confirm the published limits with the provider.':service?.status==='included'?'Included in the published package.':'Excluded from the published package.'}</T></strong>{service?.information&&<p>{service.information}</p>}</dd></div>)}</dl>}{unknown.length>0&&<details><summary><T>{'Not confirmed'}</T>{' · '}{unknown.length} <T>{'services'}</T></summary><dl className="fact-list package-service-facts">{unknown.map(({key,name,service})=><div key={key}><dt><T>{name}</T></dt><dd><T>{'Not confirmed in published package information.'}</T>{service?.information&&<p>{service.information}</p>}</dd></div>)}</dl></details>}<p className="muted"><T>{'Accommodation and transport are not inferred from hospital stay or other services. Confirm any limits with the provider.'}</T></p></DetailSection>;
}
export default async function PackageDetailPage({params}:Props){
 const {slug}=await params;const data=await getPackageDetail(slug);if(!data)notFound();const {carePackage,hospital,treatment,country}=data;
 return <main id="main-content" tabIndex={-1} className="container detail-page detail-page--package" data-page-content>
  <Breadcrumbs currentPath={`/packages/${slug}`} items={[{label:'Home',href:'/'},{label:'Packages',href:'/packages'},{label:carePackage.name}]}/>
  <DetailHero type="PUBLISHED CARE PACKAGE" title={carePackage.name} intro={carePackage.description} facts={[[carePackage.city??hospital?.city,country?.name??carePackage.country].filter(Boolean).join(', '),hospital?.name??carePackage.hospitalName,treatment?.name??'Treatment not published']} summary={<div className="package-hero-price"><PriceBlock item={carePackage}/><p><T>{priceTypeLabels[carePackage.priceType??'estimate']??'Price not published'}</T>{' · '}{carePackage.durationDays>0?<><LocalNumber value={carePackage.durationDays}/>{' '}<T>{'listed days'}</T></>:<T>{'Duration not published'}</T>}</p><p className="package-condition"><strong><T>{'Provider confirmation required'}</T></strong>{' · '}<T>{carePackage.priceType==='published_price'?'Conditional published tariff; confirm current eligibility, terms and availability.':'Confirm the current quote, dates and eligibility with the provider.'}</T></p></div>} actions={[{label:'Request assistance',href:`/request-assistance?kind=package&entityId=${carePackage.recordId}&source=package_detail`,primary:true},{label:'Ask MedBridge AI',href:`/assistant?q=${encodeURIComponent(`Show ${carePackage.name} from ${carePackage.hospitalName}`)}`}]}/>

  <div className="inline-actions"><SaveButton kind="package" recordId={carePackage.recordId}/></div>
  <DetailNavigation items={[{label:"What's included",href:'#what-s-included'},{label:"What's excluded",href:'#what-s-excluded'},{label:'Services',href:'#package-services'},{label:'Terms',href:'#validity-and-terms'},{label:'Evidence',href:'#evidence'}]}/>
  <div className="detail-layout"><div>
   <DetailSection title="Treatment and provider"><p>{treatment&&<Link href={`/treatments/${treatment.slug}`}>{treatment.name}</Link>}{' · '}{hospital&&<Link href={`/hospitals/${hospital.slug}`}>{hospital.name}</Link>}</p></DetailSection>
   <DetailSection title="What's included">{carePackage.inclusions.length?<ServiceCapsules values={carePackage.inclusions} status="included"/>:<p><T>{'Not provided in published package information.'}</T></p>}</DetailSection>
   <DetailSection title="What's excluded">{carePackage.exclusions.length?<ServiceCapsules values={carePackage.exclusions} status="excluded"/>:<p><T>{'Not provided in published package information.'}</T></p>}</DetailSection>
   <PackageServices item={carePackage}/>
   <Suspense fallback={<section className="detail-section" aria-busy="true" data-secondary-loading><h2><T>{'Terms and evidence'}</T></h2><div className="skeleton-line skeleton-line--wide"/><div className="skeleton-line"/></section>}><PackageEvidence id={carePackage.recordId}/></Suspense>
   <DetailSection id="evidence" title="Evidence and sources"><Suspense fallback={<div aria-busy="true" data-secondary-loading><div className="skeleton-line"/></div>}><CatalogProvenance item={carePackage} kind="package"/></Suspense></DetailSection>
  </div><aside className="detail-aside"><h2><T>{'Review the full cost'}</T></h2><p><T>{'This listing is not a current quote, reservation or clinical recommendation. Additional costs may apply.'}</T></p><Link className="text-link" href={`/request-assistance?kind=package&entityId=${carePackage.recordId}&source=package_detail`}><T>{'Request assistance'}</T></Link><Link className="text-link" href={`/treatment-plan?package=${encodeURIComponent(slug)}`}><T>{'Prepare planning brief'}</T> →</Link><p><T>{'Package services are separate from Lifetime Recover.'}</T></p></aside></div>
 </main>;
}
