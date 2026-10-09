'use client';
import Link from 'next/link';
import {inquiryStatusLabel} from '@/lib/inquiries/schemas';
import { useEffect,useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useExperience } from '@/components/experience/provider';
import { LocalDate } from '@/components/experience/translation';
import { InlineSkeleton } from '@/components/inline-skeleton';
import { InquiryDetail } from './detail';
type Item={id:string;title:string;status:string;updated_at:string;inquiry_source:string};
export function MyRequests(){const {api,session}=useExperience(),params=useSearchParams();const selected=params.get('request');
  const [data,setData]=useState<{owner:string;items:Item[];total:number;page:number}|null>(null),[error,setError]=useState(''),[page,setPage]=useState(0),[reload,setReload]=useState(0);const owner=session?.user.id;
  useEffect(()=>{let active=true;if(owner&&!selected)void api(`/api/inquiries?page=${page}`).then(raw=>{if(active){setData({...(raw as {items:Item[];total:number;page:number}),owner});setError('');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[api,owner,selected,page,reload]);
  if(selected)return <><Link href="/account?section=requests" className="text-link">← My Requests</Link><InquiryDetail key={`${owner}:${selected}`} id={selected}/></>;
  const current=data&&data.owner===owner&&data.page===page?data:null;
  return <>{error&&<p role="alert">{error} <button className="save-control" onClick={()=>setReload(v=>v+1)}>Retry</button></p>}{!current&&!error?<InlineSkeleton/>:!current?.items.length?<div className="account-empty"><h3>Your care questions, in one place.</h3><p>Request assistance from a published listing. Track Support replies, document requests and your next step here.</p><Link href="/hospitals" className="text-link">Explore hospitals →</Link></div>:<><ul className="personal-list">{current.items.map(item=><li key={item.id}><div><Link href={item.inquiry_source==='legacy'?'/help':`/account?section=requests&request=${item.id}`}>{item.title}</Link><p>{inquiryStatusLabel(item.status)}</p><small>Updated <LocalDate value={item.updated_at}/></small></div></li>)}</ul><div className="inline-actions"><button className="save-control" disabled={page===0} onClick={()=>setPage(v=>v-1)}>Previous</button><span>Page {page+1}</span><button className="save-control" disabled={(page+1)*25>=current.total} onClick={()=>setPage(v=>v+1)}>Next</button></div></>}</>;
}
