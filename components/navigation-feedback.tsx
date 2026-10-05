'use client';
import {useEffect,useRef,useState} from 'react';
import {usePathname,useSearchParams} from 'next/navigation';
import {useTranslation} from './experience/translation';
export function NavigationFeedback(){
  const {t}=useTranslation();
  const pathname=usePathname(),params=useSearchParams();
  const [pending,setPending]=useState(false);
  const trace=useRef<{start:number;target:string;initialMain:Element|null;shell?:number;primary?:number;feedback?:number}|null>(null);
  const last=useRef(`${pathname}?${params}`);
  useEffect(()=>{
    const click=(event:MouseEvent)=>{
      if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      const link=(event.target as Element)?.closest('a');if(!link||link.target==='_blank'||link.hasAttribute('download'))return;
      const url=new URL(link.href);if(url.origin!==location.origin||url.pathname===location.pathname&&url.search===location.search)return;
      trace.current={start:performance.now(),target:url.pathname+url.search,initialMain:document.querySelector('#main-content')};setPending(true);
      requestAnimationFrame(()=>{if(trace.current)trace.current.feedback=Math.round(performance.now()-trace.current.start);});
    };
    document.addEventListener('click',click,true);return()=>document.removeEventListener('click',click,true);
  },[]);
  useEffect(()=>{
    const observe=()=>{
      const current=trace.current;if(!current)return;
      const loading=document.querySelector('[data-route-loading]');
      const main=document.querySelector('#main-content');
      if((loading||main!==current.initialMain&&location.pathname+location.search===current.target)&&current.shell===undefined){
        current.shell=Math.round(performance.now()-current.start);
        // Next's viewport heuristic can retain a directory's deep scroll position
        // while the detail skeleton streams. A clicked new route starts at its hero.
        window.scrollTo({top:0,behavior:'instant'});
      }
      if(location.pathname+location.search!==current.target||loading)return;
      const primaryReady=!main?.classList.contains('directory-page')||Boolean(main.querySelector('[data-directory-results]'));
      if(main&&primaryReady&&current.primary===undefined&&!document.querySelector('[data-results-loading="true"]'))current.primary=Math.round(performance.now()-current.start);
      if(main&&!document.querySelector('[data-secondary-loading],[data-results-loading="true"]')){
        const result={route:current.target,feedbackMs:current.feedback,shellMs:current.shell,primaryMs:current.primary,contentMs:Math.round(performance.now()-current.start)};
        document.documentElement.dataset.navigationTiming=JSON.stringify(result);
        trace.current=null;setPending(false);
      }
    };
    const observer=new MutationObserver(observe);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-results-loading']});
    const changed=`${pathname}?${params}`!==last.current;last.current=`${pathname}?${params}`;
    const timer=setTimeout(observe,changed?0:100);return()=>{observer.disconnect();clearTimeout(timer);};
  },[pathname,params]);
  useEffect(()=>{if(!pending)return;const timer=setTimeout(()=>{trace.current=null;setPending(false);},30000);return()=>clearTimeout(timer);},[pending]);
  return <div className="navigation-feedback" data-pending={pending} role="status" aria-label={pending?t('Opening your page'):undefined}><span/></div>;
}
