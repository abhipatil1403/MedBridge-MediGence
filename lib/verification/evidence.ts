import { safeText } from '@/lib/agents/execution-state';
import { extractPage } from '@/lib/research/service';
import { approvedSources, textFromHtml, type ApprovedSource, type RetrievedPage } from '@/lib/research/sources';
import type { ResearchSource } from '@/lib/research/schemas';
import { researchResultSchema, type ResearchResult } from '@/lib/research/schemas';
import type { FieldEvidence, VerificationField, VerificationProvider } from './schemas';

export const unsafeVerificationText=/ignore.{0,30}(?:instructions|rules|system)|system prompt|(?:call|execute|invoke|run).{0,20}tool|api.?key|password|authorization|bearer |sb_secret_|sk-[\w-]{12,}|\b(?:best|safest|leading|world.class|success rate|outcomes|recommend\w*|diagnos\w*|prescrib\w*|suitable|competent)\b/i;
export function providerSources(provider:VerificationProvider):ApprovedSource[]{
  return approvedSources.filter(s=>(s.entityType??'hospital')===provider.type&&s.location.toLowerCase()===provider.location.toLowerCase()&&[s.provider,...s.aliases].some(a=>a.toLowerCase()===provider.name.toLowerCase())).slice(0,4);
}
const labels:Partial<Record<VerificationField,RegExp>>={
  address:/^(?:address|hospital address|clinic address)\s*:\s*(.+)$/i,city:/^city\s*:\s*(.+)$/i,country:/^country\s*:\s*(.+)$/i,
  phone:/^(?:phone|telephone|contact number|call)\s*:\s*([+()\d .-]{5,100})$/i,email:/^(?:email|e-mail)\s*:\s*([\w.+-]+@[\w.-]+\.[a-z]{2,})$/i,
  services:/^(?:services|departments|services offered)\s*:\s*(.+)$/i,treatments:/^(?:treatments|procedures|treatments offered)\s*:\s*(.+)$/i,
  facilities:/^facilities\s*:\s*(.+)$/i,emergency:/^(?:emergency|emergency services)\s*:\s*(.+)$/i,teleconsultation:/^teleconsultation\s*:\s*(.+)$/i,
  international_patients:/^(?:international patients|international patient services)\s*:\s*(.+)$/i,accreditation:/^(?:accreditation|certification)\s*:\s*(.+)$/i,
  specialty:/^(?:specialty|speciality)\s*:\s*(.+)$/i,affiliations:/^(?:hospital affiliation|clinic affiliation|affiliations)\s*:\s*(.+)$/i,
  credentials:/^(?:credentials|qualifications)\s*:\s*(.+)$/i,registration:/^(?:registration|registration number)\s*:\s*(.+)$/i,consultation_mode:/^consultation mode\s*:\s*(.+)$/i,
  website:/^(?:official website|website)\s*:\s*(https:\/\/[^\s]+)$/i,profile:/^(?:official profile|profile url)\s*:\s*(https:\/\/[^\s]+)$/i,
};
/** Reuse exact, recently collected research statements without inventing HTML or citations. */
export function verificationEvidenceFromResearch(provider:VerificationProvider,raw:ResearchResult,scope:VerificationField[]){
  const research=researchResultSchema.parse(raw);const sources=providerSources(provider);
  return research.sources.flatMap(record=>{
    const reviewed=sources.find(s=>s.url===record.url&&s.type===record.sourceType);if(!reviewed)return [];
    const findings=research.findings.filter(f=>f.sourceIds.includes(record.id)&&f.entity.name===reviewed.provider&&f.entity.location===reviewed.location&&['supported','conflicting'].includes(f.status));
    const evidence:FieldEvidence[]=[];
    for(const finding of findings)for(const e of finding.evidence.filter(e=>e.sourceId===record.id))for(const field of scope){
      const value=field==='name'&&e.snippet===reviewed.provider?e.snippet:labels[field]?.exec(e.snippet)?.[1]?.trim();
      if(!value||!e.snippet.includes(value)||value.length>240||unsafeVerificationText.test(e.snippet)||safeText(e.snippet)!==e.snippet||['credentials','registration'].includes(field)&&!['health_authority','regulator'].includes(reviewed.type))continue;
      if(['website','profile'].includes(field)){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.hostname!==new URL(record.url).hostname)continue;}catch{continue;}}
      evidence.push({sourceId:record.id,entityId:provider.id,field,value,snippet:e.snippet,officialSourceConfirmed:reviewed.type==='official_provider'?true:'unknown'});
    }
    return [{source:{...record,entityId:provider.id},evidence,rejected:false}];
  });
}
/** Exact statements only. Source identity uses the reviewed research collection, never domain resemblance. */
export function extractVerificationEvidence(provider:VerificationProvider,source:ApprovedSource,page:RetrievedPage,scope:VerificationField[]):{source:ResearchSource,evidence:FieldEvidence[],rejected:boolean}{
  if(!providerSources(provider).some(s=>s.url===source.url))throw new Error('Unsupported provider source');
  const extracted=extractPage(source,page,{query:provider.name,location:provider.location,providers:[provider.name],informationNeeded:['provider_details'],maxSources:1});
  const record={...extracted.source,entityId:provider.id};
  const lines=textFromHtml(page.html).split('\n');const evidence:FieldEvidence[]=[];
  const add=(field:VerificationField,value:string,snippet:string)=>{if(value.length>240||snippet.length>240||unsafeVerificationText.test(snippet)||safeText(snippet)!==snippet)return;
    if(['credentials','registration'].includes(field)&&!['regulator','health_authority'].includes(source.type))return;
    evidence.push({sourceId:record.id,entityId:provider.id,field,value,snippet,officialSourceConfirmed:source.type==='official_provider'?true:'unknown'});};
  for(const field of scope){
    if(field==='name')for(const l of lines)if(l.toLowerCase()===source.provider.toLowerCase())add(field,l,l);
    const pattern=labels[field];if(!pattern)continue;
    for(const line of lines){const match=pattern.exec(line);if(!match)continue;
      const value=match[1].trim();
      if(field==='website'||field==='profile'){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.hostname!==new URL(source.url).hostname)continue;}catch{continue;}}
      add(field,value,line);
    }
  }
  // Explicit appointment contact lists may place the label and number in
  // adjacent items. Keep both exact text lines; never use unlabeled numbers
  // or a department/emergency number as the provider's general contact.
  if(scope.includes('phone'))for(let i=0;i<lines.length-1;i++){
    if(/^For (?:OPD|Outpatient) Appointments$/i.test(lines[i])&&/^[+()\d .-]{5,100}$/.test(lines[i+1]))add('phone',lines[i+1],`${lines[i]}\n${lines[i+1]}`);
  }
  // Provider-authored structured data is evidence, never instructions. Only an
  // exact entity-name/type match is used; other hospitals on a network page are ignored.
  for(const block of page.html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{
      const raw=block[1];const parsed:unknown=JSON.parse(raw);
      const roots=Array.isArray(parsed)?parsed:parsed&&typeof parsed==='object'&&'@graph'in parsed?((parsed as Record<string,unknown>)['@graph']):[parsed];
      if(!Array.isArray(roots))continue;
      for(const node of roots.slice(0,80)){
        if(!node||typeof node!=='object'||typeof node.name!=='string'||![source.provider,...source.aliases].some(n=>n.toLowerCase()===node.name.toLowerCase()))continue;
        const allowed=provider.type==='doctor'?['physician','person']:provider.type==='clinic'?['medicalclinic']:['hospital','medicalorganization'];
        if(!allowed.includes(String(node['@type']).toLowerCase()))continue;
        const statement=(field:VerificationField,key:string,value:unknown)=>{
          if(!scope.includes(field)||typeof value!=='string'||value.length>200)return;
          const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
          const match=new RegExp(`"${escaped}"\\s*:\\s*${JSON.stringify(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`).exec(raw);
          if(!match||!match[0].includes(value))return;
          if(['website','profile'].includes(field)){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.hostname!==new URL(source.url).hostname)return;}catch{return;}}
          add(field,value,match[0]);
        };
        statement('name','name',node.name);let urlField:VerificationField='profile';try{if(new URL(node.url).pathname==='/')urlField='website';}catch{/* Invalid URL is rejected by statement. */}statement(urlField,'url',node.url);statement('phone','telephone',node.telephone);statement('email','email',node.email);
        if(node.address&&typeof node.address==='object'){
          statement('address','streetAddress',node.address.streetAddress);statement('city','addressLocality',node.address.addressLocality);statement('country','addressCountry',node.address.addressCountry);
        }
      }
    }catch{/* Malformed structured data is unsupported; no inferred replacement. */}
  }
  return {source:record,evidence:[...new Map(evidence.map(e=>[`${e.field}:${e.value}`,e])).values()].slice(0,80),rejected:lines.some(l=>unsafeVerificationText.test(l))};
}
