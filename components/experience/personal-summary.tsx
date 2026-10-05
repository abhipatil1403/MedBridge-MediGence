'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useExperience} from './provider';
import {useTranslation} from './translation';
export function PersonalSummary(){
 const {session,api}=useExperience(),{t,number}=useTranslation();
 const owner=session?.user.id;
 const [state,setState]=useState<{owner:string;saved:number;plans:number;journeys:number}|null>(null);
 useEffect(()=>{let active=true;
  if(owner)void Promise.all([api('/api/account?section=saved'),api('/api/account?section=plans'),api('/api/recovery')]).then(([saved,plans,recovery])=>{
   if(active)setState({owner,saved:(saved as {items:unknown[]}).items.length,plans:(plans as {items:{status:string}[]}).items.filter(plan=>!['completed','archived','cancelled'].includes(plan.status)).length,journeys:(recovery as {journeys:{stage:string}[]}).journeys.filter(journey=>journey.stage!=='archived').length});
  }).catch(()=>{/* The authenticated account remains the source of personal history. */});
  return()=>{active=false;};
 },[owner,api]);
 if(!owner||state?.owner!==owner)return null;
 return <section className="container personal-home" aria-label={t('Your journey')}><h2>{t('Continue your journey')}</h2><div className="personal-home__links"><Link href="/account?section=saved"><strong>{number(state.saved)}</strong>{t('Saved items')}</Link><Link href="/account?section=plans"><strong>{number(state.plans)}</strong>{t('Active plans')}</Link><Link href="/recover"><strong>{number(state.journeys)}</strong>{t('Recovery journeys')}</Link></div></section>;
}
