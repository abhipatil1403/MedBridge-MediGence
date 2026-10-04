import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { checked, PortalError } from "@/lib/portals/server";
import { getPublicSupabaseClient } from "@/lib/supabase/server";
import { recordInputSchema } from "@/lib/portals/config";
import { referenceClaimSchema, referenceOrganizationSchema, referenceSourceSchema } from "@/lib/portals/reference";
import { starterCollectedAt, starterProviders, starterReviewAfter, starterSources, type StarterSource } from "./starter";
import { starterTaxonomy } from "./taxonomy";
type DB = SupabaseClient<Database>;
type Row = {id:string;revision:number;status:string;name:string;data:Json;target_id?:string|null};
async function source(db:DB,key:StarterSource){
  const entry=starterSources[key];
  const existing=checked(await db.from("source_records").select("id").eq("source_kind","external").eq("source_name",entry.name).eq("source_url",entry.url).eq("retrieved_at",starterCollectedAt).eq("source_type",entry.sourceType).limit(1));
  if(existing[0]) return existing[0].id;
  const input=referenceSourceSchema.parse({...entry,collectedAt:starterCollectedAt,reviewAfter:starterReviewAfter,notes:"Bounded MedBridge reference collection. Review individual source-backed fields before approval. No package prices or independently verified accreditation are established by this collection."});
  const row=checked(await db.rpc("portal_reference_command",{p_action:"create_reference_source",p_input:input})) as unknown as {id:string};
  return row.id;
}
async function ids(db:DB){
  const output:Record<string,string>={};
  for(const entity of ["countries","cities","specialties","treatments"] as const){
    const rows=checked(await db.from(entity).select("id,slug"));
    for(const row of rows) output[`${entity}:${row.slug}`]=row.id;
  }
  return output;
}
function resolve(data:Record<string,unknown>,references:Record<string,string>){
  return Object.fromEntries(Object.entries(data).map(([key,value])=>{
    if(typeof value!=="string" || !value.startsWith("$")) return [key,value];
    const name=value.slice(1).replace(/^city:/,"cities:").replace(/^specialty:/,"specialties:").replace(/^treatment:/,"treatments:");
    if(!references[name]) throw new PortalError(400,"Review and publish the sourced locations, specialties and treatments before creating provider drafts.");
    return [key,references[name]];
  }));
}
export async function prepareTaxonomy(db:DB){
  const references=await ids(db); const drafts=[];
  for(const entry of starterTaxonomy){
    const sourceId=await source(db,entry.source);
    const data={...resolve(entry.data,references),slug:entry.slug,source_kind:"external",source_record_id:sourceId};
    const previous=checked(await db.from("catalog_drafts").select("*").eq("entity",entry.entity).eq("name",entry.name).neq("status","archived").order("created_at",{ascending:false}).limit(1))[0];
    if(previous){
      if(JSON.stringify(previous.data)!==JSON.stringify(data) && !same(previous.data,data)) throw new PortalError(409,`The ${entry.name} draft has changed. Review it in Catalog governance before continuing.`);
      drafts.push(previous);continue;
    }
    drafts.push(checked(await db.rpc("portal_catalog_command",{p_action:"save_catalog_draft",p_input:{entity:entry.entity,name:entry.name,targetId:references[`${entry.entity}:${entry.slug}`]??null,data:data as Json}})));
  }
  return {drafts,message:"Taxonomy drafts saved. Review their sources and fields in Catalog governance, then approve and explicitly publish them. Provider records remain private."};
}
function same(left:unknown,right:unknown):boolean{
  if(Array.isArray(left)||Array.isArray(right)) return JSON.stringify(left)===JSON.stringify(right);
  if(left && right && typeof left==="object" && typeof right==="object"){
    const a=left as Record<string,unknown>,b=right as Record<string,unknown>;
    return Object.keys(a).length===Object.keys(b).length && Object.keys(a).every(key=>same(a[key],b[key]));
  }
  return left===right;
}
export async function prepareProvider(db:DB,key:string){
  const provider=starterProviders.find(item=>item.key===key);
  if(!provider) throw new PortalError(400,"Choose a provider from the reviewed starter collection.");
  const references=await ids(getPublicSupabaseClient());
  // Resolve all canonical taxonomies before creating any records. Public reads
  // enforce the same publication boundary used by search and agents.
  for(const entry of provider.records) resolve(Object.fromEntries(Object.entries(entry.data).filter(([,value])=>value!=="$record:location")),references);
  const existing=checked(await db.from("organizations").select("id,status").eq("onboarding_origin","admin_reference").eq("name",provider.name).limit(2));
  if(existing.length>1) throw new PortalError(409,"Multiple reference workspaces have this name. Select and review the intended workspace manually.");
  if(existing[0]?.status && existing[0].status!=="active") throw new PortalError(409,"This reference workspace is not active.");
  const org=existing[0]?? checked(await db.rpc("portal_reference_command",{p_action:"create_reference_organization",p_input:referenceOrganizationSchema.parse({name:provider.name,providerType:"hospital"})})) as unknown as {id:string};
  const saved:Row[]=[];
  const sourceIds:Partial<Record<StarterSource,string>>={};
  for(const entry of provider.records){
    const data=resolve(entry.data,references);
    const matches=checked(await db.from("provider_records").select("*").eq("organization_id",org.id).eq("kind",entry.kind).eq("name",entry.name).limit(2));
    if(matches.length>1) throw new PortalError(409,"Duplicate reference sections require manual review.");
    let row=matches[0] as unknown as Row|undefined;
    if(row && !same(row.data,data)) throw new PortalError(409,`${entry.name} has been edited. Review this section manually; the starter collection will not overwrite it.`);
    if(!row) row=checked(await db.rpc("portal_command",{p_action:"save_record",p_input:recordInputSchema.parse({organizationId:org.id,kind:entry.kind,name:entry.name,data}) as unknown as Json})) as unknown as Row;
    references[`record:${entry.key}`]=row.id;
    const claims=checked(await db.from("provider_reference_claims").select("field,source_record_id").eq("record_id",row.id).eq("revision",row.revision));
    for(const field of ["name",...Object.keys(data)]){
      const sourceKey=entry.fieldSources?.[field]??entry.source;
      const sourceId=sourceIds[sourceKey]??await source(db,sourceKey);
      sourceIds[sourceKey]=sourceId;
      const previous=claims.find(claim=>claim.field===field);
      if(previous){if(previous.source_record_id!==sourceId) throw new PortalError(409,"A field has a different attached source. Review it manually.");continue;}
      if(row.status!=="draft") throw new PortalError(409,"Source associations are frozen after submission. Review this section manually.");
      checked(await db.rpc("portal_reference_command",{p_action:"attach_reference_claim",p_input:referenceClaimSchema.parse({recordId:row.id,expectedRevision:row.revision,field,sourceId,evidence:entry.evidence})}));
    }
    saved.push(row);
  }
  return {organizationId:org.id,records:saved,message:`${provider.name}: ${saved.length} sourced sections prepared. Review the fields, submit, approve each frozen section and explicitly publish through the existing workflow.`};
}
