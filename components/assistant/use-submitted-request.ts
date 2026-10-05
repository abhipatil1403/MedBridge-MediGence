'use client';
import { useEffect, useEffectEvent, useRef } from 'react';

/** Consume explicit entry submissions after authentication/history initialization.
 * The URL is consumed before sending so refresh and Strict Mode cannot replay it. */
export function useSubmittedRequest(enabled:boolean,autoStart:boolean,text:string,onSubmit:(text:string)=>void|Promise<void>) {
  const consumed=useRef(false);
  const submit=useEffectEvent(onSubmit);
  useEffect(()=>{
    if(!enabled||!autoStart||!text.trim()||consumed.current)return;
    const timer=setTimeout(()=>{
      if(consumed.current)return;
      consumed.current=true;
      const url=new URL(window.location.href);
      url.searchParams.delete('start');
      url.searchParams.delete('q');
      window.history.replaceState(window.history.state,'',url);
      void submit(text.trim());
    },0);
    return()=>clearTimeout(timer);
  },[enabled,autoStart,text]);
}
