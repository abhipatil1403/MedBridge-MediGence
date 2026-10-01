import { randomUUID } from 'node:crypto';
import type { RuntimeContext } from '@/lib/agents/runtime';
import type { CatalogSnapshot } from '@/types/catalog';
import type { AgentResponse } from '@/lib/agents/schemas';
import { ReferenceDetector } from '@/lib/conversation/ReferenceDetector';
import { ReferenceResolver } from '@/lib/conversation/ReferenceResolver';
import { buildReferenceContext, persistedResponses, type ConversationMessage } from '@/lib/conversation/context';
import { approvedSources, evidenceId } from '@/lib/research/sources';
import { verificationFields, type VerificationField, type VerificationProvider, type VerificationTool } from './schemas';
import type { VerificationAuthorization } from './service';
export function verificationIntent(content:string){if(/^\s*(?:find|search|look for)\b/i.test(content))return false;return /\b(?:verify|verification|verified|unverified|conflicting)\b/i.test(content)||/\bcheck\b.*\b(?:address|website|contact|official information|details of (?:this|the) hospital)\b/i.test(content)||/\b(?:hospital|provider|doctor)\b.*\b(?:up to date|last checked|last verified|current contact)\b/i.test(content);}
export function verificationScope(content:string):VerificationField[]{
  const matches:VerificationField[]=[];const add=(p:RegExp,fs:VerificationField[])=>{if(p.test(content))matches.push(...fs);};
  add(/address/i,['address']);add(/\bcity\b/i,['city']);add(/\bcountry\b/i,['country']);add(/website/i,['website']);add(/contact/i,['phone','email']);add(/\bphone\b/i,['phone']);add(/\bemail\b/i,['email']);add(/accreditation|certification/i,['accreditation']);add(/credentials|qualifications/i,['credentials']);add(/registration/i,['registration']);add(/affiliation/i,['affiliations']);add(/specialty|speciality/i,['specialty']);add(/services|departments/i,['services']);add(/treatments|procedures/i,['treatments']);add(/facilities|ICU/i,['facilities']);add(/emergency/i,['emergency']);add(/teleconsultation/i,['teleconsultation']);add(/international patient/i,['international_patients']);add(/profile/i,['profile']);add(/consultation mode/i,['consultation_mode']);
  return matches.length?[...new Set(matches)]:[...verificationFields];
}
export function prepareVerification(input:{content:string;conversationId:string;userId:string;recent:ConversationMessage[];snapshot:CatalogSnapshot}):NonNullable<RuntimeContext['execution']>|undefined{
  const responses=persistedResponses(input.recent,input.conversationId);const last=responses.at(-1);const previous=[...responses].reverse().find(r=>r.verification?.report)?.verification?.report;
  const pending=last?.agent==='provider_verification'?last.pendingClarification:undefined;
  const follow=Boolean(previous&&/\b(?:evidence|which details|could not be verified|refresh|history|last checked|sources disagree|compare (?:the )?verified information)\b/i.test(input.content));
  const selection=Boolean(pending&&pending.candidates.some(c=>c.displayName.toLowerCase()===input.content.trim().toLowerCase()));
  const referenceSelection=Boolean(pending&&ReferenceDetector.detect(input.content));
  if(!verificationIntent(input.content)&&!follow&&!selection&&!referenceSelection)return;
  const actionContent=pending&&(selection||referenceSelection)&&!verificationIntent(input.content)?pending.originalRequest:input.content;
  let scope=verificationScope(actionContent);let provider:VerificationProvider|undefined;let resolution:AgentResponse['referenceResolution'];
  const candidates=[...input.snapshot.hospitals.map(p=>({id:p.recordId,type:'hospital' as const,name:p.name,location:p.city,slug:p.slug,sourceKind:'medbridge_catalog' as const})),...input.snapshot.doctors.map(p=>({id:p.recordId,type:'doctor' as const,name:p.name,location:p.city,slug:p.slug,sourceKind:'medbridge_catalog' as const})),...input.snapshot.packages.map(p=>({id:p.recordId,type:'package' as const,name:p.name,location:p.country,slug:p.slug,sourceKind:'medbridge_catalog' as const,hospitalId:input.snapshot.hospitals.find(h=>h.slug===p.hospitalSlug)?.recordId})),...approvedSources.map(s=>({id:evidenceId(`provider:${s.provider}:${s.location}`),type:s.entityType??'hospital',name:s.provider,location:s.location,slug:evidenceId(`provider:${s.provider}:${s.location}`),sourceKind:'external_source' as const}))];
  const named=[...new Map(candidates.filter(p=>input.content.toLowerCase().includes(p.name.toLowerCase())||p.sourceKind==='external_source'&&approvedSources.some(s=>s.provider===p.name&&s.aliases.some(a=>new RegExp(`(?:^|\\W)${a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?:$|\\W)`,'i').test(input.content)))).map(p=>[p.id,p])).values()];
  if(named.length===1)provider=named[0];
  let query=ReferenceDetector.detect(input.content);
  if(query?.entityType==='hospital'&&/\bprovider\b/i.test(input.content)&&!/\bhospital\b/i.test(input.content))query={...query,entityType:undefined};
  if(!provider&&previous&&!query?.ordinal&&/\b(?:its|this hospital|that hospital|this doctor|that doctor|this provider|that provider)\b/i.test(input.content))provider=previous.provider;
  if(!provider&&query){
    // Latest provider list, preserving the discovery order through verification follow-ups.
    const source=[...responses].reverse().find(r=>r.agent!=='provider_verification'&&buildReferenceContext(r).groups.some(g=>['hospital','doctor','package'].includes(g.entityType)));
    const current=pending?.context??source?.referenceContext??(source?buildReferenceContext(source):undefined);
    resolution=ReferenceResolver.resolve({conversationId:input.conversationId,userMessage:input.content,currentContext:current,query});
    if(resolution.reference)provider=candidates.find(p=>p.id===resolution!.reference!.entityId);
  }
  if(!provider&&!query&&follow)provider=previous?.provider;
  if(!provider&&selection)provider=candidates.find(p=>p.id===pending!.candidates.find(c=>c.displayName.toLowerCase()===input.content.trim().toLowerCase())!.entityId);
  const question=resolution?.reason??'Which hospital, clinic, doctor, or provider should I verify? Give its exact name or select a displayed result.';
  if(provider){
    const names=[provider.name,...approvedSources.filter(s=>s.provider===provider.name).flatMap(s=>s.aliases)].sort((a,b)=>b.length-a.length);
    let fieldRequest=actionContent;
    for(const name of names)fieldRequest=fieldRequest.replace(new RegExp(`(?:^|\\W)${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?=$|\\W)`,'gi'),' ');
    scope=verificationScope(fieldRequest);
  }
  const tool:VerificationTool=/\brefresh|recheck\b/i.test(actionContent)?'refresh_provider_verification':/\bhistory\b/i.test(actionContent)?'get_provider_verification_history':/\bcompare\b/i.test(actionContent)?'compare_provider_evidence':/\bevidence|which details|could not be verified|up to date|last (?:checked|verified)|is .+ verified|why .+ conflicting\b/i.test(actionContent)?'get_provider_verification_status':'verify_provider_information';
  if(provider&&tool==='refresh_provider_verification'&&scope.length===verificationFields.length&&!/\ball\b/i.test(actionContent))scope=[...responses].reverse().find(r=>r.verification?.report?.provider.id===provider!.id)?.verification?.report?.scope??scope;
  const verifiedProviders=[...new Map(responses.flatMap(r=>r.verification?.report?[r.verification.report.provider]:[]).map(p=>[p.id,p])).values()].slice(0,3);
  const args=provider?{provider,scope,...(tool==='compare_provider_evidence'&&verifiedProviders.length>=2?{providers:verifiedProviders}:{})}:undefined;
  const authorization:VerificationAuthorization|undefined=args?{ownerId:input.userId,conversationId:input.conversationId,tool,input:args,previousResearch:[...responses].reverse().find(r=>r.research?.findings.some(f=>f.entity.name===provider!.name))?.research}:undefined;
  return {verificationAuthorization:authorization,referenceBoundary:{status:provider?'resolved':resolution?.status??'unresolved',allowedCalls:args?[{tool,input:args}]:[]},plan:{agent:tool==='compare_provider_evidence'?'comparison':'provider_verification',understanding:'Check factual provider information against explicitly attributed approved sources.',steps:args?[{tool,input:JSON.stringify(args),objective:tool.replaceAll('_',' ')}]:[],missingInformation:provider?null:question.slice(0,300)},diagnostics:{workflow:'provider_verification'},synthesis:{summary:provider?'Verification uses factual evidence only.':'Identify the provider before any verification tools run.',nextSteps:[],question:provider?null:question.slice(0,300)},finalize:async(response,results)=>{
    const verification=results.find(r=>r.result.verification)?.result.verification;
    return {...response,verification,referenceResolution:resolution,summarySource:'application',summary:verification?.message??(provider?'Provider verification could not be completed. Successful prior evidence remains available.':question),
      ...(provider?{}:{status:'awaiting_user_input' as const,pendingClarification:{id:randomUUID(),type:'reference_disambiguation' as const,conversationId:input.conversationId,runId:response.runId,originalRequest:input.content,question,candidates:resolution?.candidates??[],expectedAnswer:'entity_selection' as const,query:resolution?.query??{operation:'details' as const},context:pending?.context??[...responses].reverse().find(r=>r.referenceContext?.groups.some(g=>['hospital','doctor','package'].includes(g.entityType)))?.referenceContext,createdAt:new Date().toISOString()}}),nextSteps:provider?['Review exact source statements, unresolved fields and dates.']:[]};
  }};
}
