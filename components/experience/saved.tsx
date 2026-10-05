'use client';
import { Heart } from 'lucide-react';
import { useEffect, useState } from 'react';
import { savedItemSchema } from '@/lib/experience/preferences';
import { useExperience } from './provider';
import { useTranslation } from './translation';
type SavedRecord={kind:'hospital'|'doctor'|'package';recordId:string};
export const guestSavedKey='medbridge-saved-v1';
export function guestSaves():SavedRecord[] {
  try {const raw:unknown=JSON.parse(localStorage.getItem(guestSavedKey)||'[]');return Array.isArray(raw)?raw.slice(0,100).flatMap(item=>{const parsed=savedItemSchema.safeParse({...item,saved:true});return parsed.success?[{kind:parsed.data.kind,recordId:parsed.data.recordId}]:[];}):[];}catch{return [];}
}
const savedCache=new Map<string,Promise<SavedRecord[]>>();
export function invalidateSaves(userId?:string) {if(userId)savedCache.delete(userId);window.dispatchEvent(new Event('medbridge-saves-changed'));}
export function SaveButton({kind,recordId}:{kind:SavedRecord['kind'];recordId:string}) {
  const {session,api,authReady}=useExperience(),{t}=useTranslation();
  const owner=session?.user.id??'guest';
  const [state,setState]=useState<{owner:string;items:SavedRecord[]}>({owner:'',items:[]}),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  useEffect(()=>{
    let alive=true;
    const load=async()=>{
      try {
        let items:SavedRecord[];
        if(owner==='guest')items=guestSaves();
        else {
          if(!savedCache.has(owner))savedCache.set(owner,api('/api/account?section=saved').then(raw=>(raw as {items:{kind:SavedRecord['kind'];hospital_id:string|null;doctor_id:string|null;package_id:string|null}[]}).items.map(item=>({kind:item.kind,recordId:(item.hospital_id??item.doctor_id??item.package_id)!}))));
          items=await savedCache.get(owner)!;
        }
        if(alive)setState({owner,items});
      }catch{savedCache.delete(owner);if(alive)setNotice('Saved items could not be loaded.');}
    };
    if(authReady)void load();
    const change=()=>void load();window.addEventListener('medbridge-saves-changed',change);
    return()=>{alive=false;window.removeEventListener('medbridge-saves-changed',change);};
  },[owner,api,authReady]);
  const saved=state.owner===owner&&state.items.some(item=>item.kind===kind&&item.recordId===recordId);
  async function toggle() {
    setBusy(true);setNotice('');
    try {
      if(session)await api('/api/account',{method:'POST',body:JSON.stringify({action:'save_item',input:{kind,recordId,saved:!saved}})});
      else {const items=guestSaves().filter(item=>item.kind!==kind||item.recordId!==recordId);if(!saved)items.push({kind,recordId});localStorage.setItem(guestSavedKey,JSON.stringify(items.slice(-100)));}
      invalidateSaves(session?.user.id);
    }catch{setNotice('This item could not be saved. Please try again.');}
    finally{setBusy(false);}
  }
  return <span><button type="button" className="save-control" aria-pressed={saved} disabled={!authReady||busy} onClick={()=>void toggle()}><Heart size={16} fill={saved?'currentColor':'none'} aria-hidden="true"/>{t(`${saved?'Saved':'Save'} ${kind}`)}</button>{notice&&<small role="status" className="save-notice">{t(notice)}</small>}</span>;
}
