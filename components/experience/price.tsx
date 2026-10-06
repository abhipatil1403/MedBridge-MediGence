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
export function Price({amount,currency='USD',originalLabel='Original provider price',compact=false}:{amount:number;currency?:string;originalLabel?:string;compact?:boolean}) {
  const {preferences}=useExperience(),{t}=useTranslation();
  const [conversion,setConversion]=useState<{key:string;value:Conversion|null}|null>(null);
  const [rateOpen,setRateOpen]=useState(false);
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
  const rate=current?<>{t(current.stale?'Stale rate':'Rate')} 1 {currency} = {current.rate.toLocaleString(intlLocales[preferences.locale],{maximumFractionDigits:6})} {preferences.currency} · <LocalDateTime value={current.updatedAt}/><br/><a href={current.source} target="_blank" rel="noreferrer">{t('Rates by ExchangeRate-API')}</a> · {t('Confirm the provider quote and payment rate.')}</>:null;
  return <span className={`converted-price${compact?' converted-price--compact':''}`}>
    <span className="converted-price__amount" aria-label={`${t(originalLabel)}: ${format(amount,currency,true)}`}>{format(amount,currency,true)}</span>
    {currency!==preferences.currency&&<small className="converted-price__estimate">{hasConversion?<><span>≈ {format(amount*current.rate,preferences.currency)} · {t('Converted estimate')}</span><span className="exchange-details"><button type="button" aria-expanded={rateOpen} onClick={()=>setRateOpen(value=>!value)}>{t('Exchange rate details')}</button>{rateOpen&&<span className="exchange-details__content">{rate}</span>}</span></>:t(conversion?.key===key?'Conversion unavailable. Original price shown.':'Loading conversion. Original price shown.')}</small>}
  </span>;
}
