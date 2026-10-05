'use client';
import { LocalDate, LocalDateTime } from '@/components/experience/translation';

import { Localized } from '@/components/experience/localized';


import { T } from '@/components/experience/translation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentResponse } from '@/lib/agents/schemas';
import type { DocumentWorkspace, DocumentTool } from '@/lib/documents/schemas';

type Options={hospitals:Array<{id:string;name:string;source_kind:string}>;services:Array<{id:string;name:string}>;workspace?:DocumentWorkspace};
export function DocumentPanel({token,conversationId,disabled,onResponse,contextual=false}:{token:string;conversationId?:string;disabled:boolean;contextual?:boolean;onResponse:(response:AgentResponse)=>Promise<void>}) {
  const [options,setOptions]=useState<Options>({hospitals:[],services:[]});
  const [w,setWorkspace]=useState<DocumentWorkspace>();
  const [hospital,setHospital]=useState(''),[service,setService]=useState(''),[serviceId,setServiceId]=useState('');
  const [label,setLabel]=useState(''),[required,setRequired]=useState(true);
  const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState<number>();
  const [pendingFile,setPendingFile]=useState<File>(),[replacement,setReplacement]=useState<string>();
  const [mappings,setMappings]=useState<Record<string,string>>({});
  const [reviewed,setReviewed]=useState(false);
  const picker=useRef<HTMLInputElement>(null), mounted=useRef(true), xhr=useRef<XMLHttpRequest | undefined>(undefined);
  const load=useCallback(async()=>{
    const response=await fetch(`/api/assistant/documents${conversationId?`?conversationId=${encodeURIComponent(conversationId)}`:''}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
    const data=await response.json();
    if(!response.ok) throw new Error(data.error||'Document coordination is unavailable.');
    if(mounted.current){setOptions(data);setWorkspace(data.workspace);}
  },[conversationId,token]);
  useEffect(()=>{mounted.current=true;void load().catch(error=>{if(mounted.current)setNotice(error.message);});return()=>{mounted.current=false;xhr.current?.abort();};},[load]);
  async function accept(data:{response:AgentResponse;workspace:DocumentWorkspace}) {
    if(!mounted.current)return;
    setWorkspace(data.workspace);setReviewed(false);
    await onResponse(data.response);
    if(data.response.status==='failed')throw new Error(data.response.summary);
    setNotice(data.response.summary);
  }
  async function action(tool:DocumentTool|'start',input:unknown) {
    if(busy||disabled)return;
    setBusy(true);setNotice('');
    try {
      const response=await fetch('/api/assistant/documents',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
        body:JSON.stringify({action:tool,input,conversationId})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Document action failed.');
      await accept(data);
    }catch(error){if(mounted.current)setNotice(error instanceof Error?error.message:'Document action failed.');}
    finally{if(mounted.current)setBusy(false);}
  }
  async function upload(file:File,replaces?:string) {
    if(!w||busy||disabled)return;
    setPendingFile(file);setReplacement(replaces);setBusy(true);setNotice('');setProgress(0);
    try {
      const form=new FormData();form.set('workspaceId',w.id);form.set('file',file);if(replaces)form.set('replaces',replaces);
      const data=await new Promise<{response:AgentResponse;workspace:DocumentWorkspace}>((resolve,reject)=>{
        const request=new XMLHttpRequest();xhr.current=request;request.open('POST','/api/assistant/documents');request.setRequestHeader('Authorization',`Bearer ${token}`);
        request.upload.onprogress=event=>{if(event.lengthComputable&&mounted.current)setProgress(Math.round(event.loaded/event.total*100));};
        request.onerror=()=>reject(new Error('Upload failed. Retry the selected file.'));request.onabort=()=>reject(new Error('Upload cancelled.'));
        request.onload=()=>{try{const body=JSON.parse(request.responseText);if(request.status>=200&&request.status<300)resolve(body);else reject(new Error(body.error||'Upload failed.'));}catch{reject(new Error('Upload failed. Retry the selected file.'));}};
        request.send(form);
      });
      await accept(data);setPendingFile(undefined);setReplacement(undefined);
    }catch(error){if(mounted.current)setNotice(error instanceof Error?error.message:'Upload failed. Retry the selected file.');}
    finally{if(mounted.current){setBusy(false);setProgress(undefined);}xhr.current=undefined;}
  }
  async function download(documentId:string,filename:string) {
    if(!w)return;
    try {
      const response=await fetch(`/api/assistant/documents/download?workspaceId=${w.id}&documentId=${documentId}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
      if(!response.ok)throw new Error('This file is unavailable. Sign in again or refresh and retry.');
      const url=URL.createObjectURL(await response.blob()),anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();URL.revokeObjectURL(url);
    }catch(error){setNotice(error instanceof Error?error.message:'This file is unavailable.');}
  }
  const active=w?.documents.filter(d=>d.uploadStatus==='uploaded')??[];
  const available=(id:string)=>active.filter(d=>d.matchStatus==='matched'&&d.requirementId===id);
  const missing=w?.requirements.filter(r=>r.required&&!available(r.id).length).length??0;
  const locked=busy||disabled;
  return <details className="assistant-documents" open={Boolean(w) && contextual}><summary><T>{"Documents for this request"}</T>{' '}{w ? ` · ${active.length} private files` : ' · checklist and uploads'}</summary>
    <p><T>{"Organize explicitly requested documents. Files remain private. MedBridge does not interpret their content or determine treatment needs."}</T></p>
    {!w?<form className="assistant-document-target" onSubmit={event=>{event.preventDefault();void action('start',{hospitalId:hospital,serviceLabel:service,serviceId:serviceId||undefined});}}>
      <label><T>{"Selected hospital"}</T><select required value={hospital} disabled={locked} onChange={event=>setHospital(event.target.value)}><option value=""><T>{"Choose a hospital"}</T></option>{options.hospitals.map(h=><option key={h.id} value={h.id}>{h.name}<T>{h.source_kind==='synthetic'?' · demo':''}</T></option>)}</select></label>
      <label><T>{"Care service (optional)"}</T><select value={serviceId} disabled={locked} onChange={event=>{setServiceId(event.target.value);setService(options.services.find(s=>s.id===event.target.value)?.name??'');}}><option value=""><T>{"Enter the service you selected"}</T></option>{options.services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label><T>{"Requested service"}</T><input required maxLength={180} value={service} disabled={locked||Boolean(serviceId)} onChange={event=>setService(event.target.value)} /></label>
      <button type="submit" disabled={locked||!hospital||!service.trim()}><T>{"Get requested documents"}</T></button>
    </form>:<>
      <div className="assistant-document-target-summary"><h3>{w.hospitalName}</h3><p>{w.serviceLabel}</p><small><T>{"Start a new conversation to select a different hospital/service."}</T></small></div>
      {Boolean(w.providerEvidence?.length)&&<details><summary><T>{"Saved provider/service evidence"}</T></summary><p><T>{"This supports the stated service only. Document requirements and the manifest remain governed by the checklist below."}</T></p>{w.providerEvidence!.map((e,i)=><p key={i}><a href={e.source.url} target="_blank" rel="noopener noreferrer">{e.source.title}</a> · {e.snippet} <T>{"· Retrieved"}</T>{' '}<LocalDate value={e.source.retrievedAt}/></p>)}</details>}
      <h3><T>{"Documents requested"}</T></h3>
      {!w.requirements.length&&<p className="assistant-document-notice"><T>{"Document requirements are not available for this hospital/service. No reliable document requirements were found. No checklist has been generated."}</T></p>}
      <ul className="assistant-document-checklist">{w.requirements.map(r=>{
        const files=available(r.id),suggested=active.some(d=>d.suggestedRequirementIds.includes(r.id)&&d.matchStatus!=='matched');
        const uncertain=['unknown','unavailable'].includes(r.status);
        return <li key={r.id}><div><strong>{files.length?'✓':suggested||uncertain?'⚠':'○'} {r.label}</strong><span><T>{files.length?'Available':suggested||uncertain?'Needs review':'Missing'}</T> · {r.status}</span></div>
          {r.description&&<p>{r.description}</p>}<small><T>{"Source:"}</T>{' '}{r.source.label} · {r.source.kind.replaceAll('_',' ')}{r.source.retrievedAt?` · Retrieved ${r.source.retrievedAt.slice(0,10)}`:''}</small>
          {r.source.reference&&(/^https:\/\//.test(r.source.reference)?<a href={r.source.reference} target="_blank" rel="noopener noreferrer"><T>{"Requirement source"}</T></a>:<small>{r.source.reference}</small>)}
          {files.map(d=><p key={d.id}>{d.filename} <T>{"· Confirmed by you"}</T></p>)}</li>;
      })}</ul>
      <details><summary><T>{"Add a requirement explicitly supplied by you"}</T></summary><form onSubmit={event=>{event.preventDefault();void action('add_document_requirement',{workspaceId:w.id,label,required,confirmed:true});}}>
        <label><T>{"Requested document"}</T><input required maxLength={180} value={label} disabled={locked} onChange={event=>setLabel(event.target.value)} /></label>
        <label className="assistant-document-checkbox"><input type="checkbox" checked={required} disabled={locked} onChange={event=>setRequired(event.target.checked)} /><T>{"Required by the source I am supplying"}</T></label>
        <button disabled={locked||!label.trim()} type="submit"><T>{"Confirm requirement supplied by me"}</T></button></form></details>
      <h3><T>{"Uploaded documents"}</T></h3>
      <div className="assistant-document-drop" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();const file=event.dataTransfer.files[0];if(file&&!locked)void upload(file);}}>
        <p><T>{"Drop one file here, or choose a file. PDF, JPG/JPEG or PNG · up to 3 MB."}</T></p>
        <Localized as="input" ref={picker} type="file" aria-label="Upload document" accept="application/pdf,image/jpeg,image/png" disabled={locked} onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file,replacement);event.target.value='';}} />
        <small><T>{"Filename hints are suggestions only. Confirm each file’s requested document category."}</T></small>
      </div>
      {progress!==undefined&&<div role="status"><Localized as="progress" max="100" value={progress} aria-label="Document upload progress" /><span>{progress<100?`${progress}% uploaded`:'Upload transferred · saving securely…'}</span></div>}
      {pendingFile&&!busy&&<button type="button" onClick={()=>void upload(pendingFile,replacement)} disabled={locked}><T>{"Retry upload ·"}</T>{' '}{pendingFile.name}</button>}
      {!active.length&&<p><T>{"No uploaded documents."}</T></p>}
      <ul className="assistant-uploaded-documents">{active.map(d=><li key={d.id}>
        <strong>{d.filename}</strong><small><T>{d.mimeType==='application/pdf'?'PDF':d.mimeType==='image/png'?'PNG':'JPG'}</T> · {(d.size/1024).toFixed(1)} <T>{"KB · Uploaded"}</T>{' '}<LocalDateTime value={d.uploadedAt}/></small>
        <span><T>{d.matchStatus==='matched'?'Confirmed by you':d.matchStatus==='needs_confirmation'?'Possible match · needs confirmation':'Not matched to a requested document.'}</T></span>
        {d.duplicateOf&&<p><T>{"Possible duplicate. Both uploads are retained; choose which file to include."}</T></p>}
        {d.replaces&&<small><T>{"Replacement version · confirm its mapping before inclusion."}</T></small>}
        <label><T>{"Requested document for"}</T>{' '}{d.filename}<select aria-label={`Requested document for ${d.filename}`} value={mappings[d.id]??d.requirementId??(d.suggestedRequirementIds.length===1?d.suggestedRequirementIds[0]:'')} disabled={locked} onChange={event=>setMappings({...mappings,[d.id]:event.target.value})}>
          <option value=""><T>{"Choose a requested document"}</T></option>{w.requirements.filter(r=>['required','optional'].includes(r.status)).map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
        <div className="assistant-document-actions"><button type="button" disabled={locked||!(mappings[d.id]??d.requirementId??(d.suggestedRequirementIds.length===1?d.suggestedRequirementIds[0]:''))} onClick={()=>void action('match_document_to_requirement',{workspaceId:w.id,documentId:d.id,requirementId:mappings[d.id]??d.requirementId??d.suggestedRequirementIds[0],confirmed:true})}><T>{d.matchStatus==='matched'?'Confirm changed mapping':'Confirm match'}</T></button>
          <button type="button" disabled={locked} onClick={()=>void download(d.id,d.filename)}><T>{"Review file"}</T></button>
          <button type="button" disabled={locked} onClick={()=>{setReplacement(d.id);picker.current?.click();}}><T>{"Upload replacement"}</T></button>
          <button type="button" disabled={locked} onClick={()=>void action('remove_document',{workspaceId:w.id,documentId:d.id})}><T>{"Remove"}</T></button></div>
      </li>)}</ul>
      {replacement&&!busy&&<p><T>{"Replacing"}</T>{' '}{w.documents.find(d=>d.id===replacement)?.filename}. <button type="button" onClick={()=>{setReplacement(undefined);setPendingFile(undefined);}}><T>{"Cancel replacement"}</T></button></p>}
      {w.documents.some(d=>d.uploadStatus!=='uploaded')&&<details><summary><T>{"Version and removal history"}</T></summary><ul>{w.documents.filter(d=>d.uploadStatus!=='uploaded').map(d=><li key={d.id}>{d.filename} · {d.uploadStatus} <T>{"· Uploaded"}</T>{' '}<LocalDateTime value={d.uploadedAt}/>
        <button type="button" disabled={locked} onClick={()=>void action('remove_document',{workspaceId:w.id,documentId:d.id})}><T>{d.uploadStatus==='removed'?'Retry stored-file removal':'Remove stored version'}</T></button></li>)}</ul></details>}
      <section className="assistant-document-package"><h3><T>{"Document package"}</T></h3><dl className="assistant-metadata"><div><dt><T>{"Hospital"}</T></dt><dd>{w.hospitalName}</dd></div><div><dt><T>{"Requested service"}</T></dt><dd>{w.serviceLabel}</dd></div>
        <div><dt><T>{"Required documents"}</T></dt><dd>{w.requirements.filter(r=>r.required).length-missing} / {w.requirements.filter(r=>r.required).length} <T>{"available"}</T></dd></div><div><dt><T>{"Optional documents"}</T></dt><dd>{w.requirements.filter(r=>r.status==='optional'&&available(r.id).length).length} / {w.requirements.filter(r=>r.status==='optional').length} <T>{"available"}</T></dd></div></dl>
        <p>{missing} <T>{"required document"}</T><T>{missing===1?'':'s'}</T> <T>{"missing."}</T></p>
        <ul>{w.requirements.flatMap(r=>available(r.id).map(d=><li key={d.id}>✓ {r.label} → {d.filename} <T>{"· Confirmed by you"}</T></li>))}</ul>
        {!w.package?<><label className="assistant-document-checkbox"><input type="checkbox" checked={reviewed} disabled={locked} onChange={event=>setReviewed(event.target.checked)} /><T>{"I reviewed these files, their mappings and requirement sources."}</T></label>
          <button type="button" disabled={locked||!reviewed||missing>0||!w.requirements.length} onClick={()=>void action('prepare_document_package',{workspaceId:w.id,revision:w.revision,confirmed:true})}><T>{"Confirm & prepare package"}</T></button></>:<><strong><T>{"Ready to share"}</T></strong><p><T>{"This hospital does not have a connected submission channel in MedBridge. No documents have been sent. Use the hospital’s appropriate channel yourself."}</T></p>
          <small><T>{"Package prepared"}</T>{' '}<LocalDateTime value={w.package.preparedAt}/> <T>{"· Revision"}</T>{' '}{w.package.revision}</small>
          <button type="button" disabled={locked} onClick={()=>void action('get_document_package',{workspaceId:w.id})}><T>{"Review sharing status"}</T></button></>}
      </section>
      <p className="assistant-document-retention"><T>{"Remove files you no longer need. Automated retention is not yet configured; replacement files remain private in version history until removed. File metadata and audit history are retained for coordination."}</T></p>
    </>}
    {busy&&progress===undefined&&<p role="status"><T>{"Saving document coordination…"}</T></p>}
    {notice&&<p className="assistant-document-notice" role="status">{notice}</p>}
  </details>;
}
