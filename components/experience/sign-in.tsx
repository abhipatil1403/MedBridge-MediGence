'use client';
import { useState, type FormEvent } from 'react';
import { getBrowserSupabaseClient } from '@/lib/supabase/browser';
import { useTranslation } from './translation';
export function SignIn() {
  const {t}=useTranslation();const [email,setEmail]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setNotice('');
    try {
      const auth=getBrowserSupabaseClient();if(!auth)throw new Error('Sign-in is unavailable.');
      const callback=new URL('/auth/callback',location.origin);callback.searchParams.set('next',`${location.pathname}${location.search}`);
      const {error}=await auth.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:callback.toString()}});
      if(error)throw new Error('The sign-in link could not be sent. Please try again.');
      setNotice('Check your email and open the sign-in link. You do not need a code.');
    }catch(e){setNotice(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}
  }
  return <section className="personal-panel"><h2>{t('Sign in')} / {t('Create account')}</h2><form className="personal-form" onSubmit={submit}><label>{t('Email')}<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} maxLength={254}/></label><button type="submit" className="button button--primary button--default" disabled={busy}>{t('Send sign-in link')}</button></form><p className="personal-muted">{t('Your email is verified when you open the link.')}</p>{notice&&<p role="status" className="personal-notice">{t(notice)}</p>}</section>;
}
