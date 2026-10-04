import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("server-only",()=>({}));
import { referenceSourceSchema, referenceOrganizationSchema, referenceClaimSchema, referenceReviewSchema } from "@/lib/portals/reference";
import { starterProviders, starterSources, starterCollectedAt, starterReviewAfter } from "@/lib/reference-data/starter";
import { starterTaxonomy } from "@/lib/reference-data/taxonomy";
import { recordInputSchema } from "@/lib/portals/config";
import { hospitalCities, hospitalMatchesCity, hospitalMatchesCountry } from "@/lib/catalog/location-scope";
import { SearchService } from "@/lib/discovery/search-service";
import { RequirementExtractor } from "@/lib/requirements/RequirementExtractor";
import { RequirementEvaluator } from "@/lib/requirements/RequirementEvaluator";
import { executeTool } from "@/lib/agents/tools";
import { hospital, snapshot, tools, harness } from "./fixtures/comparison-harness";
import type { CatalogSnapshot, Hospital } from "@/types/catalog";
import { associatePackages } from "@/lib/orchestration/ContextMerger";
const provenance={origin:"admin_reference" as const,sourceName:"Official branch source",sourceUrl:"https://www.example.org/branch",checkedAt:starterCollectedAt,verification:"approved"};
const reference:Hospital={...hospital,name:"Sourced branch hospital",demo:false,sourceKind:"external",provenance,locationCities:["Pune"],treatmentCities:{"knee-replacement":["Mumbai"]},specialtyCities:{Orthopedics:["Mumbai"]},treatmentCountries:{"knee-replacement":["india"]},specialtyCountries:{Orthopedics:["india"]}};
function setup(){
  const data:CatalogSnapshot={...snapshot,hospitals:[reference],packages:[],doctors:[]};
  const repository={...tools.repository,loadSnapshot:async()=>data,listHospitals:async()=>data.hospitals,listPackages:async()=>[],listDoctors:async()=>[]};
  const search=new SearchService(repository);
  const dependencies={...tools,repository,search:(q:string,type:Parameters<typeof tools.search>[1],filters:Parameters<typeof tools.search>[2])=>search.search({q,type,...filters,sort:"relevance"})};
  return {data,search,dependencies};
}
describe("reference source and review boundaries",()=>{
  const valid={name:"Official hospital contact",url:"https://www.example.org/contact",sourceType:"provider_website",collectedAt:starterCollectedAt,reviewAfter:starterReviewAfter};
  it("requires source URL, category and actual collection time",()=>{for(const key of ["url","sourceType","collectedAt"]){const input={...valid};delete input[key as keyof typeof input];expect(referenceSourceSchema.safeParse(input).success).toBe(false);}});
  it.each(["http://www.example.org/contact","https://user:secret@example.org/contact","https://www.example.org/contact?token=secret","https://www.example.org/contact#private","https://project.supabase.co/storage/v1/object/sign/private/file"])("rejects unsafe public source URL %s",url=>expect(referenceSourceSchema.safeParse({...valid,url}).success).toBe(false));
  it("rejects future collection dates and retroactive review dates",()=>{expect(referenceSourceSchema.safeParse({...valid,collectedAt:"2099-01-01T00:00:00Z"}).success).toBe(false);expect(referenceSourceSchema.safeParse({...valid,reviewAfter:"2026-01-01"}).success).toBe(false);});
  it("requires justification for secondary sources",()=>{expect(referenceSourceSchema.safeParse({...valid,sourceType:"secondary"}).success).toBe(false);expect(referenceSourceSchema.safeParse({...valid,sourceType:"secondary",notes:"No authoritative public listing is available; this claim requires further review."}).success).toBe(true);});
  it("rejects client-controlled provider classification",()=>expect(referenceOrganizationSchema.safeParse({name:"Official hospital",providerType:"hospital",sourceKind:"first_party"}).success).toBe(false));
  it("binds claims and explicit review to a positive immutable revision",()=>{expect(referenceClaimSchema.safeParse({recordId:randomUUID(),expectedRevision:0,field:"phone",sourceId:randomUUID(),evidence:"Official contact listing"}).success).toBe(false);expect(referenceReviewSchema.safeParse({submissionId:randomUUID(),recordId:randomUUID(),expectedRevision:1,confirmed:false}).success).toBe(false);});
});
describe("bounded sourced starter collection",()=>{
  it("has five providers, five doctors and no invented package or accreditation",()=>{expect(starterProviders).toHaveLength(5);const rows=starterProviders.flatMap(provider=>provider.records);expect(rows.filter(row=>row.kind==="doctor")).toHaveLength(5);expect(rows.some(row=>["package","accreditation","international_service"].includes(row.kind))).toBe(false);});
  it.each(Object.entries(starterSources))("validates source metadata for %s",(_key,source)=>expect(referenceSourceSchema.safeParse({...source,collectedAt:starterCollectedAt,reviewAfter:starterReviewAfter}).success).toBe(true));
  it.each(starterProviders)("keeps $name facts scoped to its exact branch",provider=>{
    const references:Record<string,string>={};for(const entry of starterTaxonomy)references[`${entry.entity}:${entry.slug}`]=randomUUID();references["record:location"]=randomUUID();
    for(const entry of provider.records){
      const data=Object.fromEntries(Object.entries(entry.data).map(([key,value])=>[key,typeof value==="string"&&value.startsWith("$")?references[value.slice(1).replace(/^city:/,"cities:").replace(/^specialty:/,"specialties:").replace(/^treatment:/,"treatments:")]:value]));
      expect(recordInputSchema.safeParse({organizationId:randomUUID(),kind:entry.kind,name:entry.name,data}).success,entry.name).toBe(true);
      expect(starterSources[entry.source]).toBeDefined();expect(entry.evidence.length).toBeGreaterThan(10);
      if(!["organization","location"].includes(entry.kind))expect(data.locationId).toBe(references["record:location"]);
      if(entry.kind==="doctor")for(const field of ["consultationMode","experienceYears","registrationStatus","successRate"])expect(data[field]).toBeUndefined();
    }
  });
});
describe("published reference discovery and requirement scope",()=>{
  it("does not copy treatment availability to a second branch",()=>{expect(hospitalCities(reference,"knee-replacement")).toEqual(["Mumbai"]);expect(hospitalMatchesCity(reference,"Pune","knee-replacement")).toBe(false);expect(hospitalMatchesCity(reference,"Pune")).toBe(true);});
  it("keeps an unestablished treatment city unknown",()=>expect(hospitalCities(reference,"hip-replacement")).toEqual([]));
  it("does not transfer an offering to a branch in another country",()=>{const multi={...reference,locationCountries:["turkey"]};expect(hospitalMatchesCountry(multi,"turkey")).toBe(true);expect(hospitalMatchesCountry(multi,"turkey","knee-replacement")).toBe(false);expect(hospitalMatchesCountry(multi,"india","knee-replacement")).toBe(true);});
  it("preserves existing provider-submitted multi-location behavior",()=>expect(hospitalCities({...reference,provenance:{...provenance,origin:"provider_published"}},"knee-replacement")).toEqual(["Mumbai","Pune"]));
  it("keeps a package's sourced branch city when attaching its hospital relationship",async()=>{
    const pkg={...snapshot.packages[0],demo:false,sourceKind:"external" as const,provenance,city:"Pune"};
    const result=await executeTool("get_package",{slug:pkg.slug},{agent:"discovery",userId:randomUUID(),caseAccess:{readContext:async()=>({}),readDocumentMetadata:async()=>[]}}, {...tools,repository:{...tools.repository,listPackages:async()=>[pkg]}});
    expect(associatePackages(result.findings,{...snapshot,hospitals:[reference],packages:[pkg]})[0].facts.city).toBe("Pune");
  });
  it("searches only the documented branch for knee replacement",async()=>{const {search}=setup();expect((await search.search({q:"knee replacement in Mumbai",type:"hospitals",sort:"relevance"})).sections.hospitals).toHaveLength(1);expect((await search.search({q:"knee replacement in Pune",type:"hospitals",sort:"relevance"})).sections.hospitals).toHaveLength(0);});
  it("uses sourced branch links in requirement evaluation",async()=>{const {dependencies,data}=setup();const result=await executeTool("get_hospital",{slug:reference.slug},{agent:"discovery",userId:randomUUID(),caseAccess:{readContext:async()=>({}),readDocumentMetadata:async()=>[]}},dependencies);const requirements=RequirementExtractor.extract("I need knee replacement in Pune",data);expect(RequirementEvaluator.evaluate(result.findings[0],requirements,data).evaluations.find(row=>row.type==="location")?.status).not.toBe("exact");});
  it("does not invent packages for a reference hospital",async()=>{const {dependencies}=setup();const h=harness(undefined,dependencies);const first=await h.send("Find knee replacement hospitals in Mumbai.");const response=await h.send("Show me its packages.",first.conversationId);expect(response.findings.filter(row=>row.kind==="packages")).toEqual([]);});
  it("comparison preserves a missing branch and missing price",async()=>{const {dependencies}=setup();const response=await harness(undefined,dependencies).send("Compare knee replacement hospitals in Mumbai and Pune.");const side=response.comparison?.sides.find(side=>side.option.value==="Pune");expect(side).toBeDefined();expect(side?.groups.flatMap(group=>group.findings)).toHaveLength(0);expect(response.findings.some(row=>row.kind==="packages")).toBe(false);});
});
