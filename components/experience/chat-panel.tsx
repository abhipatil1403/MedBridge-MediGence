'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import Link from 'next/link';
import { useExperience } from './provider';
import { useTranslation } from './translation';
import { ResponseBlocks } from '@/components/assistant/assistant-workspace';
import type { AgentResponse } from '@/lib/agents/schemas';
import '@/app/assistant/assistant.css';
type Message={id:string;role:string;content:string;metadata:{response?:AgentResponse;approvalStatus?:string}};
export default function ChatPanel({onClose,page,open}:{onClose:()=>void;page?:{kind:'hospital'|'doctor'|'package';slug:string};open:boolean}) {
  const {session,api,preferences}=useExperience(),{t}=useTranslation();
  const owner=session?.user.id??'guest';
  const [history,setHistory]=useState<{owner:string;messages:Message[];conversationId?:string;guest:boolean}|null>(null),[draft,setDraft]=useState({owner,value:''}),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const content=draft.owner===owner?draft.value:'';
  const setContent=useCallback((value:string)=>setDraft({owner,value}),[owner]);
  const currentOwner=useRef(owner);
  useEffect(()=>{currentOwner.current=owner;const timer=setTimeout(()=>{setContent('');setNotice('');},0);return()=>clearTimeout(timer);},[owner,setContent]);
  const end=useRef<HTMLDivElement>(null);
  const current=history?.owner===owner?history:null;
  const request=useCallback(async(init?:RequestInit,guest=false,id?:string)=>{
    if(session&&!guest)return api(`/api/assistant/public${!init&&id?`?conversationId=${id}`:''}`,init);
    const response=await fetch('/api/assistant/public',{...init,cache:'no-store',headers:{'Content-Type':'application/json',...init?.headers}});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Please try again.');return data as unknown;
  },[api,session]);
  useEffect(()=>{
    let alive=true;
    if(open)void(async()=>{
      try{
        const guest=await request(undefined,true) as {messages:Message[];conversationId?:string};
        if(guest.messages.length){if(alive)setHistory({owner,...guest,guest:true});return;}
        let id:string|undefined;
        try {if(session){const raw=localStorage.getItem(`medbridge-active-conversation:${owner}`);id=raw?JSON.parse(raw).id:undefined;}}catch{/* Ignore stale local pointer. */}
        const data=session?await request(undefined,false,id) as {messages:Message[];conversations:{id:string}[]}:guest;
        if(alive)setHistory({owner,messages:data.messages??[],conversationId:id,guest:!session});
      }catch(e){if(alive)setNotice(e instanceof Error?e.message:'Please try again.');}
    })();
    return()=>{alive=false;};
  },[owner,open,request,session]);
  useEffect(()=>{if(open)end.current?.scrollIntoView({block:'nearest'});},[history,busy,open]);
  async function send(text:string) {
    if(!text.trim()||busy)return;
    const startOwner=owner,guest=current?.guest??!session;
    const before=current?.messages??[];
    const id=crypto.randomUUID();setBusy(true);setNotice('');setHistory({owner,messages:[...before,{id,role:'user',content:text,metadata:{}}],conversationId:current?.conversationId,guest});setContent('');
    try {
      const result=await request({method:'POST',body:JSON.stringify({content:text,conversationId:current?.conversationId,page,displayCurrency:preferences.currency})},guest) as AgentResponse;
      if(currentOwner.current!==startOwner)return;
      setHistory({owner,messages:[...before,{id,role:'user',content:text,metadata:{}},{id:crypto.randomUUID(),role:'assistant',content:result.summary,metadata:{response:result}}],conversationId:result.conversationId,guest});
      if(!guest)try{localStorage.setItem(`medbridge-active-conversation:${owner}`,JSON.stringify({id:result.conversationId}));}catch{/* Current conversation remains available in the account. */}
    }catch(e){if(currentOwner.current===startOwner){setNotice(e instanceof Error?e.message:'Please try again.');setContent(text);setHistory({owner,messages:before,conversationId:current?.conversationId,guest});}}
    finally{setBusy(false);}
  }
  async function adopt(){if(busy||!session)return;const account=owner;setBusy(true);setNotice('');try{const result=await request({method:'POST',body:JSON.stringify({content:'Keep this conversation in my account',action:'adopt'})},false) as {conversationId:string};if(currentOwner.current!==account)return;try{localStorage.setItem(`medbridge-active-conversation:${account}`,JSON.stringify({id:result.conversationId}));}catch{/* Imported history remains in the account. */}setHistory(previous=>previous?.owner===account?{...previous,conversationId:result.conversationId,guest:false}:previous);}catch(e){if(currentOwner.current===account)setNotice(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}}
  async function reset(){if(busy)return;const account=owner;setBusy(true);try{if(current?.guest)await request({method:'POST',body:JSON.stringify({content:'New conversation',action:'reset'})},true);if(currentOwner.current!==account)return;if(session)try{localStorage.removeItem(`medbridge-active-conversation:${account}`);}catch{/* New account conversation can still start. */}setHistory({owner:account,messages:[],guest:!session});setNotice('');}catch(e){if(currentOwner.current===account)setNotice(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}}
  async function decideApproval(actionId:string,decision:'approved'|'rejected'){
    if(busy||!session||current?.guest)return;
    const account=owner;setBusy(true);setNotice('');
    try{
      const result=await api('/api/assistant/approvals',{method:'POST',body:JSON.stringify({actionId,decision})}) as {status:string};
      if(currentOwner.current!==account)return;
      const data=await request(undefined,false,current?.conversationId) as {messages:Message[]};
      if(currentOwner.current!==account)return;
      setHistory(previous=>previous?.owner===account?{...previous,messages:data.messages}:previous);
      setNotice(result.status==='completed'?'The approved workspace change was completed.':'The proposed change was rejected.');
    }catch(e){if(currentOwner.current===account)setNotice(e instanceof Error?e.message:'Approval could not be saved.');}
    finally{setBusy(false);}
  }
  function submit(e:FormEvent){e.preventDefault();void send(content.trim());}
  return <div className="chat-panel"><header className="chat-header"><div><h2>{t('MedBridge assistant')}</h2><p>{t('Medical decisions require a qualified professional.')}</p></div><button onClick={onClose} type="button" aria-label={t('Close assistant')}><X size={22} aria-hidden="true"/></button></header>
    <div className="chat-messages" role="log" aria-label={t('MedBridge assistant')} aria-live="polite" aria-relevant="additions text" aria-busy={busy}>
      {!current?.messages.length&&<div className="chat-empty"><p>{t('Ask about care options or coordination')}</p>{page&&<p>{t('Public provider context')}</p>}<button className="save-control" onClick={()=>setContent('Find knee replacement hospitals in Mumbai.')}>{t('Find hospitals')}</button></div>}
      {current?.messages.map(message=><article key={message.id} className={`chat-message chat-message--${message.role}`}>{message.metadata.response?<ResponseBlocks response={message.metadata.response} approvalStatus={message.metadata.approvalStatus} disabled={busy} onRequest={text=>void send(text)} onDecision={(id,decision)=>void decideApproval(id,decision)} onRetry={()=>void send([...current.messages].reverse().find(m=>m.role==='user')?.content??'')}/>:<p>{message.content}</p>}</article>)}
      {busy&&<p role="status">{t('Working on your request…')}</p>}{notice&&<p role="alert" className="personal-notice">{t(notice)}</p>}<div ref={end}/>
    </div><form className="chat-composer" onSubmit={submit}><label className="sr-only" htmlFor="public-assistant-input">{t('Message MedBridge')}</label><textarea id="public-assistant-input" required maxLength={2000} value={content} onChange={e=>setContent(e.target.value)} disabled={busy} placeholder={t('Ask about care options or coordination')}/><div className="chat-composer__actions"><button type="button" className="save-control" onClick={()=>void reset()} disabled={busy}>{t('New conversation')}</button><button className="button button--primary button--default" disabled={busy||!content.trim()}>{t('Send')}</button></div>
      {current?.guest?<>{session?<button className="save-control" type="button" disabled={busy} onClick={()=>void adopt()}>{t('Keep this conversation in my account')}</button>:<Link href="/account">{t('Temporary conversation. Sign in to keep your plan and history.')}</Link>}</>:<Link href={current?.conversationId?`/assistant?conversation=${current.conversationId}`:'/assistant'}>{t('Open in Care Workspace')}</Link>}
    </form></div>;
}
