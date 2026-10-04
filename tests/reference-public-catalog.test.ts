import { beforeAll, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/server",()=>({getPublicSupabaseClient:()=>{
  const url=process.env.MEDBRIDGE_REFERENCE_QA_URL;
  if(!url || new URL(url).hostname!=="127.0.0.1")throw new Error("Isolated local anonymous reference catalog required");
  return createClient(url,"local-validation-anon",{auth:{persistSession:false}});
}}));
import { catalogRepository } from "@/lib/catalog/repository";
import { publishedReferenceClaims } from "@/lib/catalog/provider-profile";
import { SearchService } from "@/lib/discovery/search-service";
import { harness, tools } from "./fixtures/comparison-harness";
import type { CatalogSnapshot } from "@/types/catalog";
const enabled=process.env.RUN_REFERENCE_CATALOG_LIVE==="1" && !!process.env.MEDBRIDGE_REFERENCE_QA_URL;
describe.skipIf(!enabled)("real anonymous sourced starter catalog",()=>{
  let snapshot:CatalogSnapshot;let search:SearchService;
  beforeAll(async()=>{snapshot=await catalogRepository.loadSnapshot!();search=new SearchService({...catalogRepository,loadSnapshot:async()=>snapshot});},60000);
  it("contains five governed references and five doctors with no synthetic fallback",()=>{expect(snapshot.hospitals).toHaveLength(5);expect(snapshot.doctors).toHaveLength(5);expect([...snapshot.hospitals,...snapshot.doctors].every(row=>row.sourceKind==="external"&&!row.demo&&row.provenance?.origin==="admin_reference")).toBe(true);});
  it("has two real treatment identities and zero invented packages or prices",()=>{expect(snapshot.treatments).toHaveLength(2);expect(snapshot.packages).toEqual([]);expect(snapshot.estimates).toEqual([]);});
  it("preserves unknown doctor mode and experience",()=>expect(snapshot.doctors.every(row=>row.consultationMode==="not_confirmed"&&row.sampleExperienceYears===0)).toBe(true));
  it.each([["Mumbai","Kokilaben"],["Pune","Deenanath"],["Bengaluru","Manipal"],["Chennai","Apollo"]])("matches knee replacement at the sourced %s branch",async(city,name)=>{const result=await search.search({q:`Find knee replacement hospitals in ${city}`,type:"hospitals",sort:"relevance"});expect(result.sections.hospitals).toHaveLength(1);expect(result.sections.hospitals[0].item.name).toContain(name);});
  it("retains every public claim source without private evidence or operator IDs",async()=>{
    const claims=await publishedReferenceClaims("hospital",snapshot.hospitals[0].recordId);expect(claims.length).toBeGreaterThan(10);expect(claims.every(row=>row.sourceUrl?.startsWith("https://")&&Date.parse(row.collectedAt)>0&&["approved","verified"].includes(row.status))).toBe(true);
    for(const row of claims){expect(Object.keys(row)).not.toContain("reviewed_by");expect(Object.keys(row)).not.toContain("supported_value");expect(Object.keys(row)).not.toContain("evidence_summary");}
  });
  it("keeps private reference evidence unreadable to anonymous users",async()=>{const db=createClient(process.env.MEDBRIDGE_REFERENCE_QA_URL!,"local-validation-anon");const result=await db.from("provider_reference_claims").select("*");expect(result.error || result.data?.length===0).toBeTruthy();});
  it("handles the requested hospital, package and comparison turns using published data",async()=>{
    const dependencies={...tools,repository:{...catalogRepository,loadSnapshot:async()=>snapshot,listHospitals:async()=>snapshot.hospitals,listDoctors:async()=>snapshot.doctors,listPackages:async()=>snapshot.packages},search:(q:string,type:Parameters<typeof tools.search>[1],filters:Parameters<typeof tools.search>[2])=>search.search({q,type,...filters,sort:"relevance"})};
    const h=harness(undefined,dependencies);
    const first=await h.send("Find knee replacement hospitals in Mumbai.");expect(first.findings.some(row=>row.title.includes("Kokilaben"))).toBe(true);
    for(const content of ["Tell me more about the first one.","Show me its packages.","Tell me more about the second package.","Compare the hospitals.","Which package includes accommodation?","What information is missing?","Compare Mumbai and Pune.","Find a hospital in Pune for knee replacement.","Show me doctors associated with this hospital."]){
      const response=await h.send(content,first.conversationId);
      expect(response.findings.every(row=>row.provenance.sourceKind!=="synthetic")).toBe(true);
      expect(response.findings.filter(row=>row.kind==="packages")).toEqual([]);
      if(content.includes("Find a hospital in Pune"))expect(response.findings.some(row=>row.title.includes("Deenanath"))).toBe(true);
      if(content.includes("Compare Mumbai"))expect(response.comparison?.sides.map(side=>side.option.value)).toEqual(["Mumbai","Pune"]);
      if(content.includes("Show me doctors")){expect(response.findings.length).toBeGreaterThan(0);expect(response.findings.every(row=>row.kind==="doctors")).toBe(true);expect(response.findings.some(row=>row.title.includes("Hemant Wakankar"))).toBe(true);}
      if(content.includes("What information")){expect(response.summary).toContain("No published packages or package prices");expect(response.patientCase).toBeUndefined();}
    }
  },60000);
});
