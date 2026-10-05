'use client';
import { translate } from '@/lib/experience/messages';
import { intlLocales } from '@/lib/experience/preferences';
import { useExperience } from './provider';
export function useTranslation() {
  const {preferences,timeZone}=useExperience();
  return {t:(text:string)=>translate(text,preferences.locale),locale:preferences.locale,timeZone,
    date:(value:string)=>new Intl.DateTimeFormat(intlLocales[preferences.locale],{dateStyle:'medium',timeZone:/^\d{4}-\d{2}-\d{2}$/.test(value)?'UTC':timeZone}).format(new Date(value)),
    number:(value:number)=>new Intl.NumberFormat(intlLocales[preferences.locale]).format(value)};
}
export function T({children}:{children:string}) {return <>{useTranslation().t(children)}</>;}
export function LocalDate({value}:{value:string}) {return <time dateTime={value}>{useTranslation().date(value)}</time>;}
export function LocalDateTime({value}:{value:string}) {const {locale,timeZone}=useTranslation(),instant=new Date(value);const zone=new Intl.DateTimeFormat(intlLocales[locale],{timeZone,timeZoneName:'short'}).formatToParts(instant).find(part=>part.type==='timeZoneName')?.value;return <time dateTime={value}>{new Intl.DateTimeFormat(intlLocales[locale],{dateStyle:'medium',timeStyle:'short',timeZone}).format(instant)} {zone}</time>;}
export function LocalNumber({value}:{value:number}) {return <>{useTranslation().number(value)}</>;}
