import {Suspense} from 'react';
import type {Metadata} from 'next';
import Image from 'next/image';
import Link from '@/components/catalog-link';
import {notFound} from 'next/navigation';
import {T} from '@/components/experience/translation';
import {SaveButton} from '@/components/experience/saved';
import {Breadcrumbs} from '@/components/breadcrumbs';
import {DetailHero,DetailNavigation,DetailLinks,DetailSection} from '@/components/detail-parts';
import {CatalogProvenance} from '@/components/catalog-provenance';
import {getDoctorDetail} from '@/lib/catalog/detail-service';
import {publishedRecordProfile} from '@/lib/catalog/provider-profile';
import {detailMetadata} from '@/lib/seo';
type Props={params:Promise<{slug:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{const {slug}=await params;const data=await getDoctorDetail(slug);return data?detailMetadata(data.doctor.name,data.doctor.description,`/doctors/${slug}`):{};}
async function DoctorProfessionalInfo({profile,id,name}:{profile:ReturnType<typeof publishedRecordProfile>;id:string;name:string}){
 const value=await profile;
 return <>{value?.hasImage&&<Image src={`/api/providers/${id}/image`} alt={name} width={160} height={160} unoptimized/>}<p>{value?.professionalTitle??'Professional title not provided'}{value?.department?` · ${value.department}`:''}</p></>;
}
export default async function DoctorDetailPage({params}:Props){
 const {slug}=await params;const data=await getDoctorDetail(slug);if(!data)notFound();
 const {doctor,hospital,country,treatments,related}=data;
 const profile=publishedRecordProfile('doctor',doctor.recordId);
 const initials=doctor.name.split(' ').filter(part=>!/^dr\.?$/i.test(part)).slice(0,2).map(part=>part[0]).join('');
 return <main id="main-content" tabIndex={-1} className="container detail-page detail-page--doctor" data-page-content>
  <Breadcrumbs currentPath={`/doctors/${slug}`} items={[{label:'Home',href:'/'},{label:'Doctors',href:'/doctors'},{label:doctor.name}]}/>
  <div className="profile-avatar" aria-hidden="true">{initials}</div>
  <DetailHero type="PUBLISHED DOCTOR PROFILE" title={doctor.name} intro={doctor.description} facts={[doctor.specialty||'Specialty not provided',[doctor.city,country?.name??doctor.country].filter(Boolean).join(', '),hospital?.name??'Hospital affiliation not published']} actions={[{label:'Ask MedBridge AI about this doctor',href:`/assistant?q=${encodeURIComponent(`Show ${doctor.name}`)}`,primary:true}]}/>
  <div className="inline-actions"><SaveButton kind="doctor" recordId={doctor.recordId}/></div>
  <DetailNavigation items={[{label:'About',href:'#about'},{label:'Specialty',href:'#specialty-and-hospital'},{label:'Treatments',href:'#treatments'},{label:'Consultation',href:'#consultation'},{label:'Evidence',href:'#evidence'}]}/>
  <div className="detail-layout"><div>
   <DetailSection title="About"><p>{doctor.description}</p><Suspense fallback={<div aria-busy="true" data-secondary-loading><div className="skeleton-line"/></div>}><DoctorProfessionalInfo profile={profile} id={doctor.recordId} name={doctor.name}/></Suspense></DetailSection>
   <DetailSection title="Specialty and hospital"><p>{doctor.specialty||'Specialty not provided'}</p>{hospital?<DetailLinks items={[{label:hospital.name,href:`/hospitals/${hospital.slug}`,meta:`${hospital.city}, ${country?.name??hospital.country}`} ]}/>:<p><T>{'Hospital affiliation not provided in published information.'}</T></p>}</DetailSection>
   <DetailSection title="Experience and credentials"><p>{doctor.sampleExperienceYears>0?`${doctor.sampleExperienceYears} years of provider-listed experience`:'Experience not provided'}</p>{doctor.qualifications.length?<ul>{doctor.qualifications.map(value=><li key={value}>{value}</li>)}</ul>:<p><T>{'Qualifications not provided'}</T></p>}<p className="muted"><T>{'Publication review does not independently verify professional registration or establish clinical suitability.'}</T></p></DetailSection>
   <DetailSection title="Treatments" disclosure={!treatments.length}><DetailLinks items={treatments.map(item=>({label:item.name,href:`/treatments/${item.slug}`}))}/>{!treatments.length&&<p><T>{'Not provided in published information.'}</T></p>}</DetailSection>
   <DetailSection title="Languages" disclosure={!doctor.languages.length}>{doctor.languages.length?<ul className="tag-list">{doctor.languages.map(value=><li key={value}>{value}</li>)}</ul>:<p><T>{'Languages not provided'}</T></p>}</DetailSection>
   <DetailSection title="Consultation" disclosure={doctor.consultationMode==='not_confirmed'}><p><T>{'Availability requires confirmation'}</T></p><p><T>{'Consultation mode:'}</T>{' '}{doctor.consultationMode==='not_confirmed'?'Not confirmed in published information':doctor.consultationMode}</p><Link className="text-link" href="/help"><T>{'Get coordination support'}</T> →</Link></DetailSection>
   {related.length>0&&<DetailSection title="Related doctors"><DetailLinks items={related.map(item=>({label:item.name,href:`/doctors/${item.slug}`,meta:item.specialty}))}/></DetailSection>}
   <DetailSection id="evidence" title="Evidence and sources"><Suspense fallback={<div aria-busy="true" data-secondary-loading><div className="skeleton-line"/></div>}><CatalogProvenance item={doctor} kind="doctor"/></Suspense></DetailSection>
  </div><aside className="detail-aside"><h2><T>{'Your next step'}</T></h2><p><T>{'Explore the published information and prepare questions for the provider.'}</T></p><Link className="button button--primary" href={`/assistant?q=${encodeURIComponent(`What should I confirm about ${doctor.name}?`)}`}><T>{'Ask MedBridge AI'}</T> ↗</Link><p className="muted"><T>{'No appointment is booked from this page.'}</T></p></aside></div>
 </main>;
}
