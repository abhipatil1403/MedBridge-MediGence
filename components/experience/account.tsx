'use client';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { getBrowserSupabaseClient } from '@/lib/supabase/browser';
import { useExperience } from './provider';
import { useTranslation, LocalDate } from './translation';
import { PreferenceSelectors } from './selectors';
import { SignIn } from './sign-in';
import { SaveButton, guestSaves, guestSavedKey, invalidateSaves } from './saved';
type Profile={display_name:string|null;phone:string;country:string;city:string;locale:string;currency:string};
type Item={id:string;title?:string;query?:string;updated_at?:string;created_at?:string;status?:string;conversation_id?:string;kind?:'hospital'|'doctor'|'package';hospital_id?:string;doctor_id?:string;package_id?:string;record?:{name:string;slug:string}|null;read_at?:string|null;body?:string;resource_type?:string;resource_id?:string};
const sections=[['profile','Profile'],['preferences','Preferences'],['saved','Saved'],['searches','Recent searches'],['conversations','Recent conversations'],['plans','My plans'],['notifications','Notifications'],['privacy','Privacy and settings']] as const;
export function Account({section}:{section:string}) {
  const {session,authReady,preferences,api}=useExperience(),{t}=useTranslation();
  const [state,setState]=useState<{owner:string;section:string;profile?:Profile;inApp?:boolean;items?:Item[];error?:boolean}|null>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
  const owner=session?.user.id;
  useEffect(()=>{const changed=()=>setRefresh(v=>v+1);window.addEventListener('medbridge-saves-changed',changed);return()=>window.removeEventListener('medbridge-saves-changed',changed);},[]);
  useEffect(()=>{
    let alive=true;
    if(owner)void api(`/api/account?section=${['preferences','privacy'].includes(section)?'profile':section}`).then(raw=>{if(alive)setState({...raw as object,owner,section});}).catch(()=>{if(alive){setState({owner,section,error:true});setNotice('Account information could not be loaded. Please try again.');}});
    return()=>{alive=false;};
  },[owner,section,api,refresh]);
  if(!authReady)return <p role="status">{t('Loading…')}</p>;
  if(!session)return <SignIn/>;
  const data=state&&state.owner===owner&&state.section===section?state:null;
  async function save(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setNotice('');
    const form=new FormData(e.currentTarget);
    try{await api('/api/account',{method:'POST',body:JSON.stringify({action:'save_profile',input:{...preferences,display_name:String(form.get('name')??data?.profile?.display_name??''),phone:String(form.get('phone')??data?.profile?.phone??''),country:String(form.get('country')??data?.profile?.country??''),city:String(form.get('city')??data?.profile?.city??''),inApp:form.get('inApp')==='on'}})});setNotice('Profile saved.');setRefresh(v=>v+1);}
    catch{setNotice('Profile could not be saved. Please try again.');}finally{setBusy(false);}
  }
  async function importSaves(){setBusy(true);setNotice('');try{for(const item of guestSaves())await api('/api/account',{method:'POST',body:JSON.stringify({action:'save_item',input:{...item,saved:true}})});localStorage.removeItem(guestSavedKey);invalidateSaves(owner);setRefresh(v=>v+1);setNotice('Saved items imported.');}catch{setNotice('Some saves could not be imported. Unpublished items are unavailable.');}finally{setBusy(false);}}
  async function clear(){try{await api('/api/account',{method:'POST',body:JSON.stringify({action:'clear_searches',input:{}})});setRefresh(v=>v+1);}catch{setNotice('Please try again.');}}
  async function read(id:string){try{await api('/api/account',{method:'POST',body:JSON.stringify({action:'read_notification',input:{id}})});setRefresh(v=>v+1);}catch{setNotice('Please try again.');}}
  return <div className="account-layout"><nav className="account-nav" aria-label={t('Account')}>{sections.map(([key,label])=><Link href={`/account?section=${key}`} aria-current={section===key?'page':undefined} key={key}>{t(label)}</Link>)}<Link href="/recover">{t('Recovery journey')}</Link><Link href="/help">{t('Help / Support')}</Link><button className="save-control" onClick={()=>void getBrowserSupabaseClient()?.auth.signOut()}>{t('Sign out')}</button></nav>
    <div>{notice&&<p role="status" className="personal-notice">{t(notice)}</p>}<section className="personal-panel"><h2>{t(sections.find(([key])=>key===section)?.[1]??'Profile')}</h2>
      {!data?<p role="status">{t('Loading…')}</p>:data.error?<button className="save-control" onClick={()=>setRefresh(v=>v+1)}>{t('Try again')}</button>:['profile','preferences','privacy'].includes(section)?<>
        {section==='privacy'&&<><p>{t('Your profile, saved items, conversations and recovery journey are private to your account. Support receives only explicitly consented requests.')}</p><Link className="text-link" href="/help">{t('Manage support consent in Patient Help')}</Link></>}
        <form key={`${owner}:${refresh}`} className="personal-form" onSubmit={save}>
          {section==='profile'&&<><label>{t('Name')}<input name="name" maxLength={100} autoComplete="name" defaultValue={data.profile?.display_name??''}/></label><label>{t('Email')}<input type="email" readOnly value={session.user.email??''}/></label><label>{t('Phone (optional)')}<input name="phone" type="tel" maxLength={30} autoComplete="tel" defaultValue={data.profile?.phone}/></label><label>{t('Country')}<input name="country" maxLength={80} autoComplete="country-name" defaultValue={data.profile?.country}/></label><label>{t('City')}<input name="city" maxLength={100} autoComplete="address-level2" defaultValue={data.profile?.city}/></label></>}
          <PreferenceSelectors/><label className="check-label"><input type="checkbox" name="inApp" defaultChecked={data.inApp}/>{t('In-app notifications')}</label><button disabled={busy} className="button button--primary button--default">{t('Save profile')}</button>
        </form></>:
      section==='saved'?<><button type="button" className="save-control" onClick={()=>void importSaves()} disabled={busy}>{t('Import saves from this device')}</button>{(['hospital','doctor','package'] as const).map(kind=><section key={kind}><h3>{t(kind==='hospital'?'Saved hospitals':kind==='doctor'?'Saved doctors':'Saved packages')}</h3><ul className="personal-list">{data.items?.filter(i=>i.kind===kind).map(item=><li key={item.id}><div>{item.record?<Link href={`/${kind==='hospital'?'hospitals':kind==='doctor'?'doctors':'packages'}/${item.record.slug}`}>{item.record.name}</Link>:t('Provider listing no longer available')}</div><SaveButton kind={kind} recordId={(item.hospital_id??item.doctor_id??item.package_id)!}/></li>)}</ul>{!data.items?.some(i=>i.kind===kind)&&<p>{t('No items yet.')}</p>}</section>)}</>:
      <>{section==='searches'&&<button className="save-control" onClick={()=>void clear()}>{t('Clear recent searches')}</button>}<ul className="personal-list">{data.items?.map(item=><li key={item.id}><div>
        {section==='searches'?<Link href={`/discover?q=${encodeURIComponent(item.query??'')}`}>{item.query}</Link>:section==='plans'||section==='conversations'?<Link href={`/assistant?conversation=${item.conversation_id??item.id}`}>{item.title}</Link>:<><strong>{t(item.title??'')}</strong>{item.body&&<p>{item.resource_type==='recovery_journey'?item.body:t(item.body)}</p>}{item.resource_type==='recovery_journey'&&<Link href={`/recover?journey=${item.resource_id}`}>{t('Recovery journey')}</Link>}{item.resource_type==='support_case'&&<Link href="/help">{t('Open Patient Help')}</Link>}</>}
        {(item.updated_at||item.created_at)&&<small><LocalDate value={(item.updated_at??item.created_at)!}/></small>}
      </div>{section==='notifications'&&!item.read_at&&<button className="save-control" onClick={()=>void read(item.id)}>{t('Mark as read')}</button>}</li>)}</ul>{!data.items?.length&&<p>{t('No items yet.')}</p>}</>}
    </section></div></div>;
}
