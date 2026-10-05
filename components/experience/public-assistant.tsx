'use client';
import dynamic from 'next/dynamic';
import { Sparkles } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useRef, useState } from 'react';
import { useTranslation } from './translation';
const ChatPanel=dynamic(()=>import('./chat-panel'),{ssr:false,loading:()=> <p className="chat-loading" role="status">MedBridge…</p>});
export function PublicAssistant() {
  const pathname=usePathname(),{t}=useTranslation();
  const [loaded,setLoaded]=useState(false),[open,setOpen]=useState(false),dialog=useRef<HTMLDialogElement>(null),launcher=useRef<HTMLButtonElement>(null);
  if(/^\/(?:provider|support|admin|auth|assistant)(?:\/|$)/.test(pathname))return null;
  const match=/^\/(hospitals|doctors|packages)\/([a-z0-9-]+)$/.exec(pathname);
  const page=match?{kind:(match[1]==='hospitals'?'hospital':match[1]==='doctors'?'doctor':'package') as 'hospital'|'doctor'|'package',slug:match[2]}:undefined;
  return <><button className="assistant-launcher" ref={launcher} type="button" aria-label={t('Open MedBridge AI')} aria-haspopup="dialog" onClick={()=>{setLoaded(true);setOpen(true);dialog.current?.showModal();}}><Sparkles size={19} aria-hidden="true"/><span>MedBridge AI</span></button>
    <dialog ref={dialog} className="public-assistant" aria-label="MedBridge AI" onClose={()=>{setOpen(false);launcher.current?.focus();}} onClick={e=>{if(e.currentTarget===e.target)dialog.current?.close();}}>{loaded&&<ChatPanel open={open} page={page} onClose={()=>dialog.current?.close()}/>}</dialog></>;
}
