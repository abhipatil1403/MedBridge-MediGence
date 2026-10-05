"use client";
import { useState } from 'react';
import { T, LocalDate } from '@/components/experience/translation';
import { packageCollectedAt, packageSources, packageTaxonomy, sourcedPackages } from '@/lib/reference-data/package-starter';
import { packagePrice } from '@/lib/catalog/pricing';
import { Action, Panel, usePortal, useResource } from './core';
import type { Row } from '@/lib/portals/config';
export function PackageStarter({onSelect}:{onSelect:(id:string)=>void}){
  const {token,refresh}=usePortal();const {data}=useResource<{rows:Row[]}>('catalog_drafts',{size:'200'});
  const [busy,setBusy]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState('');
  async function prepare(action:string,key?:string){setBusy(key??action);setError('');setMessage('');try{
    const response=await fetch('/api/portals/reference-starter?portal=admin',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({action,...(key?{key}:{})})});
    const result=await response.json();if(!response.ok)throw new Error(result.error??'Unable to prepare drafts.');setMessage(result.message);refresh();if(result.organizationId)onSelect(result.organizationId);
  }catch(e){setError(e instanceof Error?e.message:'Unable to prepare drafts.');}finally{setBusy('');}}
  return <Panel title="Official-source package collection">
    <p><T>{'Seven health check packages from two already published hospital branches. Collected'}</T>{' '}<LocalDate value={packageCollectedAt}/>.</p>
    <p><T>{'Deenanath prices are payable INR tariffs effective 15 July 2026. Kokilaben USD tariffs are conditional Air Tanzania listings with no validity dates; confirm current eligibility and price. No surgery packages, durations or unlisted services are established.'}</T></p>
    <button className="portal-button secondary" disabled={!!busy} onClick={()=>prepare('prepare_package_taxonomy')}><T>{'Prepare package taxonomy drafts'}</T></button>
    {packageTaxonomy.map(entry=>{const draft=data?.rows.find(item=>item.entity===entry.entity&&item.name===entry.name&&item.status!=='archived');return <details key={entry.slug}><summary>{entry.name} · {draft?.status??'Not prepared'}</summary><a href={packageSources[entry.source].url} target="_blank" rel="noreferrer"><T>{'Read official source'}</T></a>{draft&&<><pre className="portal-audit-value">{JSON.stringify(draft.data,null,2)}</pre>{draft.status==='draft'&&<Action action="approve_catalog" input={{draftId:draft.id,expectedRevision:draft.revision}}><T>{'Approve'}</T>{' '}{entry.name}</Action>}{draft.status==='approved'&&<Action action="publish_catalog" input={{draftId:draft.id,expectedRevision:draft.revision}} confirm><T>{'Publish'}</T>{' '}{entry.name}</Action>}</>}</details>;})}
    {sourcedPackages.map(entry=><details key={entry.key}><summary>{entry.name} · {packagePrice({listedPrice:Number(entry.data.price),currency:String(entry.data.currency),priceType:String(entry.data.priceType)})}</summary><p>{entry.evidence}</p><a href={packageSources[entry.source].url} target="_blank" rel="noreferrer"><T>{'Read official source'}</T></a><pre className="portal-audit-value">{JSON.stringify(entry.data,null,2)}</pre><button className="portal-button" disabled={!!busy} onClick={()=>prepare('prepare_package',entry.key)}><T>{busy===entry.key?'Preparing…':'Prepare private package draft'}</T></button></details>)}
    {message&&<p role="status">{message}</p>}{error&&<p role="alert" className="portal-error">{error}</p>}
    <p className="portal-muted"><T>{'Preparation preserves immutable source associations and creates private admin reference drafts. Every claim and frozen section needs review, approval and explicit publication.'}</T></p>
  </Panel>;
}
