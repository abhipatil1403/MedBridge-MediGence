'use client';
import { useEffect, useState } from 'react';
import { intlLocales } from '@/lib/experience/preferences';
import type { Conversion } from '@/lib/experience/currency';
import { useExperience } from './provider';
import { LocalDateTime, useTranslation } from './translation';
const quotes=new Map<string,{at:number;promise:Promise<Conversion|null>}>();
function quote(from:string,to:string) {
  const key=`${from}:${to}`,cached=quotes.get(key);
  if(cached&&Date.now()-cached.at<60_000)return cached.promise;
  const promise=fetch(`/api/currency?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then(async r=>r.ok?(await r.json()).quote as Conversion|null:null).catch(()=>null);
  quotes.set(key,{at:Date.now(),promise});return promise;
}
export function Price({amount,currency='USD',originalLabel='Original provider price'}:{amount:number;currency?:string;originalLabel?:string}) {
  const {preferences}=useExperience(),{t}=useTranslation();
  const [conversion,setConversion]=useState<{key:string;value:Conversion|null}|null>(null);
  const key=`${currency}:${preferences.currency}`;
  useEffect(()=>{
    let active=true;
    if(currency!==preferences.currency)void quote(currency,preferences.currency).then(value=>{if(active)setConversion({key,value});});
    return ()=>{active=false;};
  },[currency,preferences.currency,key]);
  function format(value:number,code:string,original=false) {
    try{return new Intl.NumberFormat(intlLocales[preferences.locale],{style:'currency',currency:code,currencyDisplay:original?'code':'symbol',maximumFractionDigits:2,minimumFractionDigits:0}).format(value).replaceAll('\u00a0',' ');}
    catch{return `${code} ${value.toLocaleString(intlLocales[preferences.locale])}`;}
  }
  if(!Number.isFinite(amount)||amount<0)return <span>{t('Price not provided')}</span>;
  const current=conversion?.key===key?conversion.value:null;
  const hasConversion=currency!==preferences.currency&&current;
  return <span className="converted-price"><span className="converted-price__amount">{format(hasConversion?amount*current.rate:amount,hasConversion?preferences.currency:currency,!hasConversion)}</span>
    {currency!==preferences.currency&&<small>{hasConversion?<>{t('Converted estimate')} · {t(originalLabel)}: {format(amount,currency,true)}<br/>{t(current.stale?'Stale rate':'Rate')} 1 {currency} = {current.rate.toLocaleString(intlLocales[preferences.locale],{maximumFractionDigits:6})} {preferences.currency} · <LocalDateTime value={current.updatedAt}/><br/><a href={current.source} target="_blank" rel="noreferrer">{t('Rates by ExchangeRate-API')}</a> · {t('Confirm the provider quote and payment rate.')}</>:t(conversion?.key===key?'Conversion unavailable. Original price shown.':'Loading conversion. Original price shown.')}</small>}
  </span>;
}
