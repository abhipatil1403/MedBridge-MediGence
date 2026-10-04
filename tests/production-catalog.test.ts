import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { getPublicSupabaseClient: () => {
    const url = process.env.MEDBRIDGE_PUBLIC_QA_URL;
    if (!url || new URL(url).hostname !== "127.0.0.1") throw new Error("Isolated anonymous PostgREST required");
    return createClient(url, "local-validation-anon", { auth: { persistSession: false, autoRefreshToken: false } });
  } };
});
import { catalogRepository } from "@/lib/catalog/repository";
import { getHospitalDetail, getDoctorDetail, getPackageDetail } from "@/lib/catalog/detail-service";
import { SearchService } from "@/lib/discovery/search-service";
import { executeTool, toFinding } from "@/lib/agents/tools";
import { packageDisplayPrice } from "@/lib/catalog/pricing";
import { attributeEvidence } from "@/lib/requirements/RequirementEvidence";
import { RequirementExtractor } from "@/lib/requirements/RequirementExtractor";
import { RequirementEvaluator } from "@/lib/requirements/RequirementEvaluator";
import { harness, pkg } from "./fixtures/comparison-harness";

describe("production package evidence", () => {
  it.each([['included', 'exact'], ['excluded', 'not_met'], ['conditional', 'incomplete'], ['not_confirmed', 'unknown']] as const)("preserves explicit accommodation %s", (status, expected) => {
    expect(attributeEvidence({ ...pkg, inclusions: ['Hospital stay'], serviceDetails: { accommodation: { status, information: null } } }, 'accommodation').status).toBe(expected);
  });
  it("does not infer missing accommodation from hospital stay", () => {
    expect(attributeEvidence({ ...pkg, inclusions: ['Hospital stay'] }, 'accommodation').status).toBe('unknown');
  });
  it("keeps contradictory published evidence unresolved", () => {
    expect(attributeEvidence({ ...pkg, exclusions: ['Accommodation'], serviceDetails: { accommodation: { status: 'included', information: null } } }, 'accommodation').status).toBe('incomplete');
  });
  it("formats the listed currency without converting it", () => {
    expect(packageDisplayPrice({ currency: 'INR', listedPrice: 25000, samplePriceUsd: 0 })).toBe('₹25,000');
    expect(packageDisplayPrice({ currency: 'USD', listedPrice: 25000, samplePriceUsd: 0 })).toContain('25,000');
  });
});

const live = process.env.RUN_PUBLIC_CATALOG_LIVE === '1' && !!process.env.MEDBRIDGE_PUBLIC_QA_URL;
describe.skipIf(!live)("real anonymous production boundary in isolated PostgreSQL", () => {
  const context = { agent: 'discovery' as const, userId: '00000000-0000-4000-8000-000000000001', caseAccess: { readContext: async () => ({}), readDocumentMetadata: async () => [] } };
  it("returns only the explicitly published non-QA provider", async () => {
    const snapshot = await catalogRepository.loadSnapshot!();
    expect(snapshot.treatments.find(row => row.slug === 'knee-replacement')?.countries).toContain('india');
    expect(snapshot.hospitals).toHaveLength(1); expect(snapshot.doctors).toHaveLength(1); expect(snapshot.packages).toHaveLength(1);
    expect([...snapshot.hospitals, ...snapshot.doctors, ...snapshot.packages].every(row => !row.demo && row.sourceKind === 'first_party')).toBe(true);
    expect(snapshot.hospitals[0].provenance?.origin).toBe('provider_published');
  });
  it("resolves both directions of hospital and doctor relationship", async () => {
    const [hospital] = await catalogRepository.listHospitals();
    const detail = await getHospitalDetail(hospital.slug);
    const doctor = await getDoctorDetail(detail!.doctors[0].slug);
    expect(doctor!.hospital!.recordId).toBe(hospital.recordId);
    expect(doctor!.doctor.qualifications).toEqual([]);
  });
  it("resolves both directions of hospital and package relationship", async () => {
    const [hospital] = await catalogRepository.listHospitals();
    const detail = await getHospitalDetail(hospital.slug);
    const pack = await getPackageDetail(detail!.packages[0].slug);
    expect(pack!.hospital!.recordId).toBe(hospital.recordId);
    expect(pack!.carePackage.listedPrice).toBe(25000);
    expect(pack!.carePackage.serviceDetails?.accommodation?.status).toBe('included');
  });
  it("Discovery searches the same anonymous canonical catalog", async () => {
    const search = new SearchService(catalogRepository);
    const results = await search.search({ q: 'knee replacement hospitals in Mumbai', type: 'hospitals', sort: 'relevance' });
    expect(results.sections.hospitals).toHaveLength(1);
    expect((await search.search({ q: '', type: 'hospitals', sort: 'relevance', accreditation: 'sample' })).sections.hospitals).toHaveLength(1);
    expect((await search.search({ q: '', type: 'hospitals', sort: 'relevance', accreditation: 'none' })).sections.hospitals).toHaveLength(0);
    const result = await executeTool('search_hospitals', { query: 'knee replacement hospitals in Mumbai', city: 'Mumbai', treatment: 'knee-replacement' }, context);
    expect(result.findings).toHaveLength(1); expect(result.findings[0].provenance.label).toBe('Published provider information');
  });
  it("Requirement Matching uses the actual published package evidence", async () => {
    const snapshot = await catalogRepository.loadSnapshot!();
    const finding = toFinding('packages', snapshot.packages[0]);
    const req = RequirementExtractor.extract('I need knee replacement in Mumbai under ₹6 lakh with accommodation.', snapshot);
    const evaluation = RequirementEvaluator.evaluate(finding, req, snapshot);
    expect(evaluation.evaluations.find(row => row.type === 'accommodation')?.status).toBe('exact');
    expect(evaluation.evaluations.find(row => row.type === 'budget')?.status).toBe('exact');
  });
  it("Comparison consumes only published canonical records", async () => {
    const search = new SearchService(catalogRepository);
    const h = harness(undefined, { repository: catalogRepository, search: (q, type, filters) => search.search({ q, type, ...filters, sort: 'relevance' }), compare: async () => undefined });
    const answer = await h.send('Compare knee replacement hospitals in Mumbai and Pune.');
    expect(answer.comparison).toBeDefined();
    const findings = answer.comparison!.sides.flatMap(side => side.groups.flatMap(group => group.findings));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every(row => row.provenance.sourceKind === 'first_party')).toBe(true);
    expect(answer.summary).not.toMatch(/better hospital|preferred hospital|success rate/i);
  });
  it("direct anonymous reads reject QA and private evidence", async () => {
    const db = createClient(process.env.MEDBRIDGE_PUBLIC_QA_URL!, 'local-validation-anon', { auth: { persistSession: false } });
    for (const table of ['hospitals','doctors','packages'] as const) {
      const result = await db.from(table).select('id').eq('source_kind','synthetic');
      expect(result.error).toBeNull(); expect(result.data).toEqual([]);
    }
    expect((await db.from('provider_documents').select('*')).error).not.toBeNull();
    expect((await db.from('hospitals').select('verified_by')).error).not.toBeNull();
    expect((await db.from('hospitals').select('accreditation_note')).error).not.toBeNull();
    expect((await db.from('doctors').select('verification_source')).error).not.toBeNull();
  });
  it("an entirely synthetic catalog is truly empty under real RLS", () => {
    const json = execFileSync('psql', ['-w','-h','127.0.0.1','-p','55432','-U','postgres','-d','production_catalog_20261004','-Atc',"set role anon; select jsonb_build_object('hospitals',(select count(*) from public.hospitals),'doctors',(select count(*) from public.doctors),'packages',(select count(*) from public.packages),'search',(select count(*) from public.search_catalog_candidates('')));"], { encoding: 'utf8' }).trim().split('\n').at(-1)!;
    expect(JSON.parse(json)).toEqual({ hospitals: 0, doctors: 0, packages: 0, search: 0 });
  });
});
