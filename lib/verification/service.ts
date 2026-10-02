import { randomUUID } from 'node:crypto';
import { AgentError } from '@/lib/agents/errors';
import { canonicalInput } from '@/lib/agents/execution-state';
import type { CatalogSnapshot } from '@/types/catalog';
import { retrieveOfficialPage, type ResearchRetriever } from '@/lib/research/sources';
import { providerSources, extractVerificationEvidence,verificationEvidenceFromResearch } from './evidence';
import type { ResearchResult } from '@/lib/research/schemas';
import { classifyReport } from './classify';
import { configuredFreshnessPolicy, classifyFreshness, VERIFICATION_CACHE_MS, type FreshnessPolicy } from './policy';
import { verificationToolSchemas, verificationResultSchema, type VerificationProvider, type VerificationField, type VerificationTool, type VerificationReport, type VerificationResult } from './schemas';
import type { VerificationStore } from './store';
export interface VerificationAuthorization{ownerId:string;conversationId:string;tool:VerificationTool;input:unknown;previousResearch?:ResearchResult}
export function authorizeVerification(tool:string,input:unknown,userId:string,auth?:VerificationAuthorization){return Boolean(userId&&auth&&auth.ownerId===userId&&auth.tool===tool&&canonicalInput(auth.input)===canonicalInput(input));}
export function internalProviderFacts(provider:VerificationProvider,snapshot:CatalogSnapshot):Partial<Record<VerificationField,string>>{
  if(provider.sourceKind==='external_source')return {};
  const record=(provider.type==='doctor'?snapshot.doctors:provider.type==='package'?snapshot.packages:snapshot.hospitals).find(r=>r.recordId===provider.id&&r.name===provider.name);
  if(!record)throw new AgentError('VERIFICATION_PROVIDER_NOT_RESOLVED','The selected provider is no longer available.');
  const item=record as unknown as Record<string,unknown>;const facts:Partial<Record<VerificationField,string>>={name:record.name};
  const mapping:Partial<Record<VerificationField,string>>={city:'city',country:'country',services:'specialties',treatments:'treatmentSlugs',facilities:'infrastructure',specialty:'specialty',affiliations:'hospitalName',credentials:'qualifications',consultation_mode:'consultationMode'};
  for(const [field,key] of Object.entries(mapping)){const v=item[key];if(typeof v==='string'&&v)facts[field as VerificationField]=v;else if(Array.isArray(v)&&v.length)facts[field as VerificationField]=v.join('; ').slice(0,500);}
  return facts;
}
function failure(error:unknown):VerificationReport['outcomes'][number]{const code=error&&typeof error==='object'&&'code'in error?String(error.code):'';return code==='rate_limit'?'rate_limit':code==='unsupported_source'?'unsupported_source':error instanceof Error&&(/timeout|timed out|abort/i.test(error.name+error.message)||code==='timeout')?'timeout':'source_unavailable';}
export function ageVerificationReport(r:VerificationReport,policy:FreshnessPolicy,now=new Date().toISOString()):VerificationReport{
  const projected=classifyReport({...r,internal:Object.fromEntries(r.fields.filter(f=>f.internalValue!==null).map(f=>[f.field,f.internalValue!])),evidence:r.fields.flatMap(f=>f.evidence),completedAt:now,policy});
  return {...projected,completedAt:r.completedAt,activity:r.activity,freshness:classifyFreshness(r.completedAt,'report',policy,Date.parse(now)),fields:projected.fields.map(f=>({...f,checkedAt:r.fields.find(old=>old.field===f.field)!.checkedAt}))};
}
export async function verifyProviderTool(tool:VerificationTool,raw:unknown,userId:string,auth:VerificationAuthorization|undefined,store:VerificationStore|undefined,snapshot:CatalogSnapshot,retrieve:ResearchRetriever=retrieveOfficialPage,policy:FreshnessPolicy=configuredFreshnessPolicy()):Promise<VerificationResult>{
  const input=verificationToolSchemas[tool].parse(raw);
  if(!authorizeVerification(tool,input,userId,auth))throw new AgentError('VERIFICATION_ACTION_DENIED','Provider verification requires a resolved provider and an authenticated request.');
  if(!store)throw new AgentError('VERIFICATION_STORAGE_UNAVAILABLE','Provider verification storage is not configured.');
  const history=(await store.history(userId,auth!.conversationId,input.provider.id)).map(r=>ageVerificationReport(r,policy));
  const latest=history.find(r=>r.ownerId===userId&&r.conversationId===auth!.conversationId&&r.provider.id===input.provider.id);
  if(tool==='compare_provider_evidence'){
    const providers=verificationToolSchemas.compare_provider_evidence.parse(raw).providers;
    if(providers){const peers=(await Promise.all(providers.map(async p=>(await store.history(userId,auth!.conversationId,p.id)).find(r=>r.ownerId===userId&&r.conversationId===auth!.conversationId&&r.provider.id===p.id)))).filter((r):r is VerificationReport=>Boolean(r)).map(r=>ageVerificationReport(r,policy));
      return verificationResultSchema.parse({report:peers[0],peers,history:[],message:`${peers.length} providers have saved factual evidence for comparison. Missing fields and conflicts remain unresolved. No clinical ranking is established.`,reused:true});}
  }
  if(tool==='get_provider_verification_history')return verificationResultSchema.parse({report:latest,history,message:history.length?'Saved factual verification runs.':'No saved verification runs exist for this provider.',reused:true});
  if(tool==='get_provider_verification_status'||tool==='compare_provider_evidence'){const scoped=history.find(r=>input.scope.every(f=>r.scope.includes(f)))??latest;return verificationResultSchema.parse({report:scoped,history:[],message:scoped?'Review factual field evidence and unresolved conflicts. No clinical ranking is established.':'This provider has no saved verification. Verify it first.',reused:true});}
  const internal=internalProviderFacts(input.provider,snapshot);
  const catalogRecord=input.provider.sourceKind==='medbridge_catalog'?(input.provider.type==='doctor'?snapshot.doctors:input.provider.type==='package'?snapshot.packages:snapshot.hospitals).find(r=>r.recordId===input.provider.id):undefined;
  // Source kind comes from the owned catalog snapshot, never a model/tool hint.
  const provider:VerificationProvider={...input.provider,...(catalogRecord?{catalogSourceKind:catalogRecord.sourceKind}:{})};
  const synthetic=provider.catalogSourceKind==='synthetic';
  const reusable=!synthetic&&latest&&input.scope.every(f=>latest.scope.includes(f)&&latest.fields.find(x=>x.field===f)?.internalValue===(internal[f]??null))&&latest.status!=='verification_incomplete'&&!latest.outcomes.length&&!latest.fields.some(f=>input.scope.includes(f.field)&&['stale','conflicting'].includes(f.status))&&(Date.now()-Date.parse(latest.completedAt)<VERIFICATION_CACHE_MS||input.scope.every(f=>{const field=latest.fields.find(x=>x.field===f)!;return field.status==='verified'&&field.evidence.every(e=>{const s=latest.sources.find(s=>s.id===e.sourceId)!;return classifyFreshness(s.publishedAt??s.retrievedAt,f,policy)==='current';});}));
  if(tool!=='refresh_provider_verification'&&reusable)return verificationResultSchema.parse({report:latest,history:[],message:'Reused the saved evidence; last checked time is unchanged.',reused:true});
  const startedAt=new Date().toISOString();const sources=synthetic?[]:providerSources(provider);const outcomes:VerificationReport['outcomes']=sources.length?[]:['unsupported_source'];const warnings:string[]=synthetic?['Synthetic provider record. Not a live provider; authoritative verification is unavailable.']:[];
  const prior=!synthetic&&tool!=='refresh_provider_verification'&&auth!.previousResearch?verificationEvidenceFromResearch(input.provider,auth!.previousResearch,input.scope):[];
  const pages=await Promise.allSettled(sources.map(async source=>{
    const cached=prior.find(p=>p.source.url===source.url&&input.scope.every(f=>p.evidence.some(e=>e.field===f))&&input.scope.every(f=>classifyFreshness(p.source.publishedAt??p.source.retrievedAt,f,policy)!=='stale')&&(Date.now()-Date.parse(p.source.retrievedAt)<VERIFICATION_CACHE_MS||input.scope.every(f=>classifyFreshness(p.source.publishedAt??p.source.retrievedAt,f,policy)==='current')));
    if(cached)return cached;
    const started=Date.now();let page;
    try{page=await retrieve(source);}catch(error){if(failure(error)==='source_unavailable'&&Date.now()-started<1000){page=await retrieve(source);}else throw error;}
    return extractVerificationEvidence(input.provider,source,page,input.scope);
  }));
  const evidence=[];const collected=[];
  for(const page of pages){if(page.status==='fulfilled'){collected.push(page.value.source);evidence.push(...page.value.evidence);if(page.value.rejected)warnings.push('Instruction-like or clinical marketing text was excluded from evidence.');}else outcomes.push(failure(page.reason));}
  const report=classifyReport({id:randomUUID(),ownerId:userId,conversationId:auth!.conversationId,provider,scope:[...new Set(input.scope)],internal,sources:collected,evidence,outcomes:[...new Set(outcomes)],startedAt,completedAt:new Date().toISOString(),policy,warnings:[...new Set(warnings)]});
  await store.save(report);
  return verificationResultSchema.parse({report,history:[],message:report.status==='verification_incomplete'?'Official provider verification could not be completed. Review the specific retrieval or source coverage outcome.':`${report.counts.verified} factual fields supported; ${report.counts.unresolved} unresolved. Sources disagree where marked conflicting; manual confirmation may be required.`,reused:false});
}
