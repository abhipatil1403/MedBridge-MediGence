import {Suspense} from 'react';
import type {Metadata} from 'next';
import Link from '@/components/catalog-link';
import {notFound} from 'next/navigation';
import {T,LocalDate} from '@/components/experience/translation';
import {SaveButton} from '@/components/experience/saved';
import {PackagePrice} from '@/components/experience/package-price';
import {Breadcrumbs} from '@/components/breadcrumbs';
import {DetailHero,DetailNavigation,DetailLinks,DetailSection} from '@/components/detail-parts';
import {CatalogProvenance} from '@/components/catalog-provenance';
import {getHospitalDetail} from '@/lib/catalog/detail-service';
import {publishedProviderProfile} from '@/lib/catalog/provider-profile';
import {fieldLabel} from '@/lib/catalog/field-label';
import {detailMetadata} from '@/lib/seo';
type Props={params:Promise<{slug:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{const {slug}=await params;const data=await getHospitalDetail(slug);return data?detailMetadata(data.hospital.name,data.hospital.description,`/hospitals/${slug}`):{};}
async function HospitalInformation({profile}:{profile:ReturnType<typeof publishedProviderProfile>}){
 const value=await profile;
 return <>
  <DetailSection title="Departments and provider information" disclosure={!value?.sections?.some(s=>s.kind==='specialty'||s.kind==='treatment')}>{value?.sections?.filter(s=>s.kind==='specialty'||s.kind==='treatment').map(s=><article key={`${s.kind}:${s.name}`}><h3>{s.department||s.name}</h3>{s.locationCity&&<p><T>{'Documented location:'}</T>{' '}{s.locationCity}</p>}<p>{s.description??'Provider-specific information not provided.'}</p>{s.availability&&<p><T>{'Availability:'}</T>{' '}{s.availability.replaceAll('_',' ')}</p>}{s.eligibilityNote&&<p>{s.eligibilityNote}</p>}</article>)}{!value?.sections?.some(s=>s.kind==='specialty'||s.kind==='treatment')&&<p><T>{'No department information has been published.'}</T></p>}</DetailSection>
  <DetailSection title="Facilities" disclosure={!value?.sections?.some(s=>s.kind==='facility')}>{value?.sections?.filter(s=>s.kind==='facility').map(s=><article key={s.name}><h3>{s.name}</h3><p>{s.description??'Description not provided'}</p></article>)}{!value?.sections?.some(s=>s.kind==='facility')&&<p><T>{'Not provided in published information.'}</T></p>}</DetailSection>
  <DetailSection title="Accreditations" disclosure={!value?.accreditations?.length}>{value?.accreditations?.length?<ul>{value.accreditations.map(a=><li key={a.name}>{a.name}{a.body?` · ${a.body}`:''}{a.expiresOn?` · expires ${a.expiresOn}`:''}</li>)}</ul>:<p><T>{'No current accreditation evidence is published.'}</T></p>}</DetailSection>
  <DetailSection title="International patient services" disclosure={!value?.internationalServices?.length}>{value?.internationalServices?.length?value.internationalServices.map(s=><article key={s.name}><h3>{s.name}</h3>{s.description&&<p>{s.description}</p>}{s.languages?.length?<p>{s.languages.join(', ')}</p>:null}<p><T>{'Availability:'}</T>{' '}{s.availability?.replaceAll('_',' ')??'Not provided'}</p></article>):<p><T>{'International services require provider confirmation.'}</T></p>}</DetailSection>
  <DetailSection id="contact" title="Contact and locations">{value?.address&&<p>{value.address}</p>}{value?.phone&&<p><T>{'Phone:'}</T>{' '}{value.phone}</p>}{value?.email&&<p><T>{'Email:'}</T>{' '}<a href={`mailto:${value.email}`}>{value.email}</a></p>}{value?.website&&<a href={value.website} target="_blank" rel="noreferrer"><T>{'Official provider website'}</T></a>}{value?.locations?.map(l=><article key={l.name}><h3>{l.name}</h3><p>{[l.address,l.city].filter(Boolean).join(' · ')}</p>{l.phone&&<p>{l.phone}</p>}</article>)}{!value?.address&&!value?.phone&&!value?.email&&!value?.website&&!value?.locations?.length&&<p><T>{'Not provided in published information.'}</T></p>}</DetailSection>
  {Boolean(value?.fieldReviews?.length)&&<details className="detail-section"><summary><T>{'Reviewed field evidence'}</T></summary><dl className="fact-list">{value?.fieldReviews?.map(f=><div key={f.field}><dt>{fieldLabel(f.field)}</dt><dd>{f.status}{f.sourceUrl&&<>{' · '}<a href={f.sourceUrl} target="_blank" rel="noreferrer"><T>{'Checked source'}</T></a></>}{' · '}<LocalDate value={f.checkedAt}/></dd></div>)}</dl></details>}
 </>;
}
export default async function HospitalDetailPage({params}:Props){
 const {slug}=await params;const data=await getHospitalDetail(slug);if(!data)notFound();
 const {hospital,country,treatments,doctors,packages,related}=data;const profile=publishedProviderProfile(hospital.recordId);
 return <main id="main-content" tabIndex={-1} className="container detail-page detail-page--hospital" data-page-content>
  <Breadcrumbs currentPath={`/hospitals/${slug}`} items={[{label:'Home',href:'/'},{label:'Hospitals',href:'/hospitals'},{label:hospital.name}]}/>
  <DetailHero identityKind="hospital" type={hospital.provenance?.origin==='admin_reference'?'MEDBRIDGE REFERENCE':'PUBLISHED PROVIDER'} title={hospital.name} intro="" facts={[`${hospital.city}, ${country?.name??hospital.country}`,'Reviewed for publication · confirm current details',`${packages.length} published packages`]} actions={[{label:'Ask MedBridge AI about this hospital',href:`/assistant?q=${encodeURIComponent(`Show ${hospital.name}`)}`,primary:true},{label:'Get coordination support',href:'/help'}]}/>
  <div className="inline-actions"><SaveButton kind="hospital" recordId={hospital.recordId}/></div>
  <DetailNavigation items={[{label:'Overview',href:'#overview'},{label:'Specialties',href:'#specialties'},{label:'Treatments',href:'#treatments'},{label:'Doctors',href:'#doctors'},{label:'Packages',href:'#packages'},{label:'Services',href:'#international-patient-services'},{label:'Evidence',href:'#evidence'}]}/>
  <div className="detail-layout"><div>
   <DetailSection title="Overview"><p>{hospital.description}</p>{hospital.sampleBedCount>0&&<p>{hospital.sampleBedCount} <T>{'provider-listed beds'}</T></p>}</DetailSection>
   <DetailSection title="Specialties">{hospital.specialties.length?<ul className="tag-list">{hospital.specialties.map(s=><li key={s}>{s}</li>)}</ul>:<p><T>{'Not provided in published information.'}</T></p>}</DetailSection>
   <DetailSection title="Treatments"><DetailLinks items={treatments.map(t=>({label:t.name,href:`/treatments/${t.slug}`}))}/>{!treatments.length&&<p><T>{'No treatments have been published.'}</T></p>}</DetailSection>
   <DetailSection title="Doctors" disclosure={!doctors.length}><DetailLinks items={doctors.map(d=>({label:d.name,href:`/doctors/${d.slug}`,meta:d.specialty}))}/>{!doctors.length&&<p><T>{'No associated doctors have been published.'}</T></p>}</DetailSection>
   <DetailSection title="Packages" disclosure={!packages.length}><DetailLinks items={packages.map(p=>({label:p.name,href:`/packages/${p.slug}`,meta:<PackagePrice item={p}/>}))}/>{!packages.length&&<p><T>{'No associated packages have been published.'}</T></p>}</DetailSection>
   {hospital.infrastructure.length>0&&<DetailSection title="Published facilities"><ul>{hospital.infrastructure.map(f=><li key={f}>{f}</li>)}</ul></DetailSection>}
   {related.length>0&&<DetailSection title="Related hospitals"><DetailLinks items={related.map(h=>({label:h.name,href:`/hospitals/${h.slug}`,meta:h.city}))}/></DetailSection>}
   <Suspense fallback={<section className="detail-section" aria-busy="true" data-secondary-loading><h2><T>{'Provider information'}</T></h2><div className="skeleton-line skeleton-line--wide"/><div className="skeleton-line"/></section>}><HospitalInformation profile={profile}/></Suspense>
   <DetailSection id="evidence" title="Evidence and sources"><Suspense fallback={<div aria-busy="true" data-secondary-loading><div className="skeleton-line"/></div>}><CatalogProvenance item={hospital} kind="hospital"/></Suspense></DetailSection>
  </div><aside className="detail-aside"><h2><T>{'Confirm your next step'}</T></h2><p><T>{'Prices and documented services require current confirmation. No booking or payment is processed here.'}</T></p><Link className="text-link" href={`/assistant?q=${encodeURIComponent(`What should I confirm about ${hospital.name}?`)}`}><T>{'Ask MedBridge AI'}</T> ↗</Link><Link className="text-link" href="/help"><T>{'Get coordination support'}</T> →</Link></aside></div>
 </main>;
}
