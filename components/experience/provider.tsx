'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getBrowserSupabaseClient } from '@/lib/supabase/browser';
import { preferenceSchema, type Preferences } from '@/lib/experience/preferences';

type Experience = { preferences: Preferences; timeZone:string; session: Session | null; authReady: boolean; notice: string;
  setPreferences: (p: Preferences) => Promise<void>; api: (path: string, init?: RequestInit) => Promise<unknown> };
const Context = createContext<Experience | null>(null);
export const preferenceKey = 'medbridge-preferences-v1';
function saveLocal(p: Preferences) {
  try { localStorage.setItem(preferenceKey,JSON.stringify(p)); } catch { /* Storage can be disabled; the current selection still works. */ }
  document.cookie=`medbridge_preferences=${encodeURIComponent(JSON.stringify(p))}; Path=/; SameSite=Lax; Max-Age=31536000${location.protocol==='https:'?'; Secure':''}`;
  document.documentElement.lang=p.locale;
}
export function ExperienceProvider({ initial, children }: { initial: Preferences; children?: ReactNode }) {
  const [preferences,setPreferenceState]=useState(initial),[session,setSession]=useState<Session|null>(null),[authReady,setAuthReady]=useState(false),[notice,setNotice]=useState('');
  const [timeZone,setTimeZone]=useState('UTC');
  const owner=useRef<string|undefined>(undefined);
  const current=useRef(initial);
  const version=useRef(0);
  const pendingSave=useRef<Promise<void>>(Promise.resolve());
  const api=useCallback(async(path:string,init?:RequestInit)=>{
    const auth=getBrowserSupabaseClient();
    const token=(await auth?.auth.getSession())?.data.session?.access_token;
    if(!token) throw new Error('Sign in to continue.');
    const response=await fetch(path,{...init,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...init?.headers}});
    const data=await response.json();
    if(!response.ok) throw new Error(data.error||'Please try again.');
    return data as unknown;
  },[]);
  useEffect(()=>{
    let alive=true;
    let local: Preferences;
    try { local=preferenceSchema.parse(JSON.parse(localStorage.getItem(preferenceKey)||'null')); }
    catch { local=initial; }
    current.current=local;
    const timer=setTimeout(()=>{if(alive){setPreferenceState(local);saveLocal(local);setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);}},0);
    const auth=getBrowserSupabaseClient();
    if(!auth) {queueMicrotask(()=>setAuthReady(true));return ()=>{alive=false;clearTimeout(timer);};}
    async function apply(next:Session|null) {
      if(!alive)return;
      const id=next?.user.id;
      setSession(next);setAuthReady(true);
      if(owner.current===id)return;
      owner.current=id;
      if(!id)return;
      const started=version.current;
      try {
        const data=await api('/api/account') as {profile:{locale:string;currency:string;preferences_updated_at:string|null}};
        if(!alive||owner.current!==id||version.current!==started)return;
        if(data.profile.preferences_updated_at) {
          const saved=preferenceSchema.parse({locale:data.profile.locale,currency:data.profile.currency});
          current.current=saved;setPreferenceState(saved);saveLocal(saved);
        } else {
          await api('/api/account',{method:'POST',body:JSON.stringify({action:'save_preferences',input:current.current})});
        }
      } catch {if(alive&&owner.current===id)setNotice('Account preferences could not be loaded. Your local selection is available.');}
    }
    void auth.auth.getSession().then(({data})=>apply(data.session));
    const {data:subscription}=auth.auth.onAuthStateChange((_event,next)=>{setTimeout(()=>void apply(next),0);});
    return ()=>{alive=false;clearTimeout(timer);subscription.subscription.unsubscribe();};
  },[api,initial]);
  const setPreferences=useCallback(async(raw:Preferences)=>{
    const next=preferenceSchema.parse(raw),revision=++version.current,account=session?.user.id;
    current.current=next;setPreferenceState(next);saveLocal(next);setNotice('');
    if(account){
      const save=pendingSave.current.then(async()=>{
        if(owner.current!==account)return;
        await api('/api/account',{method:'POST',body:JSON.stringify({action:'save_preferences',input:next})});
      });
      pendingSave.current=save.catch(()=>{});
      try{await save;}catch{if(owner.current===account&&version.current===revision)setNotice('Saved on this device. Account preferences could not be updated; please try again.');}
    }
  },[api,session]);
  return <Context.Provider value={{preferences,timeZone,session,authReady,notice,setPreferences,api}}>{children}</Context.Provider>;
}
export function useExperience() {
  const context=useContext(Context);
  if(!context)throw new Error('ExperienceProvider is required.');
  return context;
}
