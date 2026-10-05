"use client";
import { LocalDate } from '@/components/experience/translation';


import { T } from '@/components/experience/translation';
import Link from "next/link";
import { useState } from "react";
import { starterProviders, starterSources, starterCollectedAt } from "@/lib/reference-data/starter";
import { starterTaxonomy } from "@/lib/reference-data/taxonomy";
import { Action, Panel, usePortal, useResource } from "./core";
import type { Row } from "@/lib/portals/config";
export function ReferenceStarter({onSelect}:{onSelect:(id:string)=>void}){
  const {token,refresh}=usePortal();
  const {data:taxonomyDrafts}=useResource<{rows:Row[]}>("catalog_drafts",{size:"200"});
  const [busy,setBusy]=useState("");const [message,setMessage]=useState("");const [error,setError]=useState("");
  async function prepare(action:string,key?:string){
    setBusy(key??action);setMessage("");setError("");
    try{
      const response=await fetch("/api/portals/reference-starter?portal=admin",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({action,...(key?{key}:{})})});
      const result=await response.json();if(!response.ok)throw new Error(result.error??"Unable to prepare drafts.");
      setMessage(result.message);refresh();if(result.organizationId)onSelect(result.organizationId);
    }catch(error){setError(error instanceof Error?error.message:"Unable to prepare drafts.");}finally{setBusy("");}
  }
  return <Panel title="Sourced starter collection">
    <p><T>{"Five specific hospital branches, five named doctors and documented offerings. Collected"}</T>{' '}<LocalDate value={starterCollectedAt}/><T>{". No packages, prices, accreditation attestations, consultation modes or unlisted patient services are supplied."}</T></p>
    <details><summary><T>{"Review location and treatment taxonomy sources"}</T></summary><ul>{starterTaxonomy.map(entry=><li key={`${entry.entity}:${entry.slug}`}>{entry.name} · {entry.entity} · <a href={starterSources[entry.source].url} target="_blank" rel="noreferrer">{starterSources[entry.source].name}</a></li>)}</ul><p><T>{"Only sourced taxonomy facts are entered. Existing sample clinical and travel descriptions are cleared in these drafts."}</T></p></details>
    <button className="portal-button secondary" disabled={!!busy} onClick={()=>prepare("prepare_taxonomy")}><T>{busy==="prepare_taxonomy"?"Preparing…":"Prepare sourced taxonomy drafts"}</T></button>
    <p><T>{"Review, approve and explicitly publish these taxonomy drafts before preparing hospital records. Full catalog editing is available under"}</T><Link href="/admin/countries"><T>{"Countries"}</T></Link>, <Link href="/admin/cities"><T>{"Cities"}</T></Link>, <Link href="/admin/specialties"><T>{"Specialties"}</T></Link> <T>{"and"}</T><Link href="/admin/treatments"><T>{"Treatments"}</T></Link>.</p>
    {starterTaxonomy.map(entry=>{const draft=taxonomyDrafts?.rows.find(row=>row.entity===entry.entity && row.name===entry.name && row.status!=="archived");return draft?<details key={`${entry.entity}:${entry.slug}`}><summary>{entry.name} · {draft.status}</summary><pre className="portal-audit-value">{JSON.stringify(draft.data,null,2)}</pre><a href={starterSources[entry.source].url} target="_blank" rel="noreferrer"><T>{"Read supporting source"}</T></a>{draft.status==="draft" && <Action action="approve_catalog" input={{draftId:draft.id,expectedRevision:draft.revision}}><T>{"Approve"}</T>{' '}{entry.name} <T>{"taxonomy"}</T></Action>}{draft.status==="approved" && <Action action="publish_catalog" input={{draftId:draft.id,expectedRevision:draft.revision}} confirm><T>{"Publish"}</T>{' '}{entry.name} <T>{"taxonomy"}</T></Action>}</details>:null;})}
    {starterProviders.map(provider=><details key={provider.key}><summary>{provider.name} · {provider.city}</summary><ul>{provider.records.map(record=><li key={record.key}><strong>{record.name}</strong> · {record.kind}<p>{record.evidence}</p><a href={starterSources[record.source].url} target="_blank" rel="noreferrer"><T>{"Read official source"}</T></a><dl>{Object.entries(record.data).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{Array.isArray(value)?value.join(", "):String(value).startsWith("$")?String(value).slice(1).replaceAll(":",": "):String(value)}</dd></div>)}</dl></li>)}</ul><button className="portal-button" disabled={!!busy} onClick={()=>prepare("prepare_provider",provider.key)}><T>{busy===provider.key?"Preparing sourced drafts…":"Prepare private provider drafts"}</T></button></details>)}
    {message&&<p role="status">{message}</p>}{error&&<p className="portal-error" role="alert">{error}</p>}
    <p className="portal-muted"><T>{"Preparing drafts records sources and immutable evidence associations. Each field and frozen section still needs Admin review, approval and explicit publication. Repeating preparation preserves existing records and stops if an Admin has edited their facts."}</T></p>
  </Panel>;
}
