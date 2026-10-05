'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useExperience} from './provider';
import {useTranslation} from './translation';
export function PersonalSummary(){
 const {session,api}=useExperience(),{t,number}=useTranslation();
 const owner=session?.user.id;
 const [state,setState]=useState<{owner:string;hospitals:number;doctors:number;packages:number;plans:number;journeys:number;conversation?:string;title?:string}|null>(null);
 useEffect(()=>{let active=true;
  if(owner)void Promise.all([api('/api/account?section=saved'),api('/api/account?section=plans'),api('/api/recovery'),api('/api/account?section=conversations')]).then(([saved,plans,recovery,history])=>{
   const items=(saved as {items:{kind:string}[]}).items,activePlans=(plans as {items:{status:string;title:string;conversation_id:string}[]}).items.filter(plan=>!['completed','archived','cancelled'].includes(plan.status));
   const latest=(history as {items:{id:string;title:string}[]}).items[0];
   if(active)setState({owner,hospitals:items.filter(item=>item.kind==='hospital').length,doctors:items.filter(item=>item.kind==='doctor').length,packages:items.filter(item=>item.kind==='package').length,plans:activePlans.length,journeys:(recovery as {journeys:{stage:string}[]}).journeys.filter(journey=>journey.stage!=='archived').length,conversation:latest?.id??activePlans[0]?.conversation_id,title:latest?.title??activePlans[0]?.title});
  }).catch(()=>{/* The authenticated account remains the source of personal history. */});
  return()=>{active=false;};
 },[owner,api]);
 if(!owner||state?.owner!==owner||!(state.hospitals+state.doctors+state.packages+state.plans+state.journeys)&&!state.conversation)return null;
 return <section className="container personal-home" aria-label={t('Your journey')}><h2>{t('Continue your journey')}</h2>{state.conversation&&<Link className="text-link" href={`/assistant?conversation=${state.conversation}`}>{t('Continue your conversation')} · {state.title} →</Link>}<div className="personal-home__links">{([['hospitals','Saved hospitals'],['doctors','Saved doctors'],['packages','Saved packages']] as const).filter(([key])=>state[key]>0).map(([key,label])=><Link href="/account?section=saved" key={key}><strong>{number(state[key])}</strong>{t(label)}</Link>)}{state.plans>0&&<Link href="/account?section=plans"><strong>{number(state.plans)}</strong>{t('Active plans')}</Link>}{state.journeys>0&&<Link href="/recover"><strong>{number(state.journeys)}</strong>{t('Recovery journeys')}</Link>}</div></section>;
}
