"use client";

import { T } from '@/components/experience/translation';
import { useState } from "react";
import { type Row, label } from "@/lib/portals/config";
import { CommandForm } from "./command-form";
import { Panel, Status, date, usePortal, useResource } from "./core";

function fact(value: unknown) { return Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value); }
export function ReferenceClaims({row, submissionId,onSectionApproved}: {row: Row; submissionId?:string;onSectionApproved?:()=>void}) {
  const {portal,command} = usePortal();
  const [selected,setSelected] = useState<Row>();
  const [checkedClaims,setCheckedClaims]=useState(false);
  const [checkedIdentity,setCheckedIdentity]=useState(false);
  const [busy,setBusy]=useState(false);
  const [decisionError,setDecisionError]=useState("");
  const {data,error,loading} = useResource<{rows:Row[]}>(portal === "admin" ? "provider_reference_claims" : "",{recordId:String(row.id),revision:String(row.revision),size:"200"});
  if (portal !== "admin" || (!data?.rows.length && submissionId && !loading)) return null;
  const values = Object.entries({name:row.name,...row.data}).filter(([,value])=>value != null && value !== "" && !(Array.isArray(value) && !value.length));
  const missing = values.filter(([key])=> !data?.rows.some(claim=>claim.field === key));
  const source = selected?.source as Record<string,unknown>|undefined;
  return <Panel title="Field sources and evidence">
    {error && <p role="alert">{error}</p>}
    <p><T>{"Sources support exact values in revision"}</T>{' '}{row.revision}<T>{". Attaching a source does not approve a claim. Private evidence and reviewer identities do not appear on public pages."}</T></p>
    <dl className="portal-facts">{values.map(([key,value])=> {
      const claim = data?.rows.find(item=>item.field === key);
      const src = claim?.source as Record<string,unknown>|undefined;
      return <div key={key}><dt><T>{label(key.replace(/([A-Z])/g," $1"))}</T></dt><dd>{fact(value)}<br/>{src ? <><a href={String(src.source_url)} target="_blank" rel="noreferrer">{String(src.source_name)}</a> · <T>{label(String(src.source_type))}</T><br/><T>{"Collected"}</T>{' '}{date(src.retrieved_at)}{src.review_after ? <> · <T>{"Review due"}</T>{' '}{date(src.review_after)}</> : ""}<details><summary><T>{"Private evidence"}</T></summary><p>{String(claim?.evidence_summary)}</p></details>{submissionId && <button className="portal-button secondary" onClick={()=>setSelected(claim)}><T>{"Review this claim"}</T></button>}</> : <Status value="evidence_required"/>}</dd></div>;
    })}</dl>
    {!submissionId && missing.length>0 && ["draft","changes_requested"].includes(String(row.status)) && <CommandForm key={missing.map(([key])=>key).join(",")} action="attach_reference_claim" input={{recordId:row.id,expectedRevision:row.revision}} fields={[
      {key:"field",label:"Claim to support",type:"select",options:missing.map(([key])=>key)},
      {key:"sourceId",label:"Supporting source",type:"select",catalog:"source_records",catalogParams:{reference:"true"}},
      {key:"evidence",label:"Concise private evidence summary",type:"textarea",help:"Explain how this source supports the exact field. Do not copy marketing text."}
    ]} submit="Attach source to claim"/>}
    {selected && submissionId && <CommandForm key={String(selected.id)} action="review_field" input={{submissionId,recordId:row.id,field:selected.field,sourceUrl:source?.source_url}} fields={[
      {key:"status",label:`Review ${String(selected.field)}`,type:"select",options:["approved","verified","needs_confirmation","conflicting","rejected","stale"]},
      {key:"evidence",label:"Private review evidence / reason",type:"textarea"},
      {key:"expiresOn",label:"Evidence expiry (if applicable)",type:"date"}
    ]} initial={{status:"approved",evidence:selected.evidence_summary}} submit="Record field decision" onDone={()=>setSelected(undefined)}/>}
    {submissionId && !missing.length && Boolean(data?.rows.length) && <details><summary><T>{"Review all sourced claims in this section"}</T></summary><p><T>{"Read every linked source and exact value above before confirming. This records an individual review for each field; section approval and publication remain separate."}</T></p><CommandForm action="review_reference_claims" input={{submissionId,recordId:row.id,expectedRevision:row.revision}} fields={[
      {key:"confirmed",label:"I checked every populated claim against its linked source",type:"checkbox"},
      ...(row.kind === "organization" ? [{key:"identityChecked",label:"I checked the organization name and exact branch identity on its official source",type:"checkbox"} as const] : [])
    ]} submit="Record checked claim decisions"/></details>}
    {submissionId && onSectionApproved && !missing.length && Boolean(data?.rows.length) && <form className="portal-form" onSubmit={async event=>{
      event.preventDefault();if(!checkedClaims || row.kind==="organization"&&!checkedIdentity)return;
      setBusy(true);setDecisionError("");
      try{
        await command("review_reference_claims",{submissionId,recordId:row.id,expectedRevision:row.revision,confirmed:true,identityChecked:checkedIdentity});
        await command("review_section",{submissionId,recordId:row.id,expectedRevision:row.revision,status:"approved",comment:"Each populated claim was checked against its attached source and exact branch. Publication review does not establish clinical quality or suitability.",reason:"Source-backed reference section review."});
        onSectionApproved();
      }catch(error){setDecisionError(error instanceof Error?error.message:"Unable to record this section decision.");}finally{setBusy(false);}
    }}><p><T>{"Approve this frozen section after checking the sourced facts. Submission approval and explicit publication remain separate actions."}</T></p><label className="portal-check"><input type="checkbox" checked={checkedClaims} onChange={event=>setCheckedClaims(event.target.checked)}/><T>{"I checked every field and its exact branch against the linked source"}</T></label>{row.kind==="organization" && <label className="portal-check"><input type="checkbox" checked={checkedIdentity} onChange={event=>setCheckedIdentity(event.target.checked)}/><T>{"I checked the official organization and branch identity"}</T></label>}<button className="portal-button" disabled={busy||!checkedClaims||row.kind==="organization"&&!checkedIdentity}><T>{busy?"Recording decisions…":"Review claims and approve section"}</T></button>{decisionError&&<p role="alert">{decisionError}</p>}</form>}
    {!loading && !missing.length && <p className="portal-muted"><T>{"All populated fields have source associations. Approval still requires a resolved review for each claim. Verified means the specific claim was checked; it does not verify clinical quality."}</T></p>}
  </Panel>;
}
