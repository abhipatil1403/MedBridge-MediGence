import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { harness, snapshot, tools, unavailable, hospital, pkg, userId } from './fixtures/comparison-harness';
import { HospitalMatchingAgent, hospitalMatchingInputSchema } from '@/lib/agents/HospitalMatchingAgent';
import { RequirementExtractor } from '@/lib/requirements/RequirementExtractor';
import { toFinding } from '@/lib/agents/tools';
import { assistantResponseSchema } from '@/lib/agents/schemas';
import { SearchService } from '@/lib/discovery/search-service';
import type { CatalogSnapshot } from '@/types/catalog';

const query = 'Find knee replacement hospitals in Mumbai under $6,000 with accommodation.';
function matches(content = query, data = snapshot, complete = true) {
  return HospitalMatchingAgent.match({ requirements: RequirementExtractor.extract(content, data),
    requestedOperations: ['discover_hospitals', 'discover_packages'] },
  data.hospitals.map((h) => toFinding('hospitals', h, 'exact', 'Catalog identity')),
  data.packages.map((p) => toFinding('packages', p, 'exact', 'Catalog identity')), data, complete);
}
function dependencies(data: CatalogSnapshot) {
  const repository = { ...tools.repository, loadSnapshot: async () => data, listHospitals: async () => data.hospitals,
    listPackages: async () => data.packages };
  const service = new SearchService(repository);
  return { ...tools, repository, search: (q: string, type: Parameters<typeof tools.search>[1], filters: Parameters<typeof tools.search>[2]) =>
    service.search({ q, type, ...filters, sort: 'relevance' }) };
}
const status = (m: ReturnType<typeof matches>[number], type: string) => m.criteria.find((c) => c.evaluation.type === type)?.evaluation.status;

describe('HospitalMatchingAgent evidence and orchestration', () => {
  it('validates strict input without duplicating budget or treatment', () => {
    expect(hospitalMatchingInputSchema.safeParse({ requirements: [], requestedOperations: ['discover_hospitals'], budget: 6000 }).success).toBe(false);
    expect(hospitalMatchingInputSchema.safeParse({ requirements: [], requestedOperations: ['discover_packages'] }).success).toBe(false);
  });
  it('routes a single hospital search through existing discovery tools', async () => {
    const response = await harness().send('Find knee replacement hospitals in Mumbai.');
    expect(response.agent).toBe('hospital_matching'); expect(response.tasks.map((t) => t.tool)).toEqual(['search_hospitals']);
    expect(response.hospitalMatches?.[0].classification).toBe('strong_match');
    expect(response.hospitalMatches?.[0].packageEvidenceRequested).toBe(false);
    expect(response.requirements?.map((r) => r.type)).toEqual(['procedure', 'location']);
    expect(response.findings[0].slug).toBe(hospital.slug);
  });
  it('keeps hospital budget N/A and package budget exact', async () => {
    const response = await harness().send('Find knee replacement hospitals in Mumbai under $6000 and check their packages.');
    const match = response.hospitalMatches![0];
    expect(match.hospital.requirementEvaluation?.evaluations.find((e) => e.type === 'budget')?.status).toBe('not_applicable');
    expect(status(match, 'budget')).toBe('exact'); expect(match.classification).toBe('strong_match');
    expect(match.criteria.find((c) => c.evaluation.type === 'budget')?.source?.recordId).toBe(pkg.recordId);
  });
  it('retrieves linked packages implicitly for a budget', async () => {
    const response = await harness().send('Find knee replacement hospitals in Mumbai under $6000.');
    expect(response.tasks.map((t) => t.tool)).toEqual(['search_hospitals', 'search_packages']);
    expect(response.hospitalMatches![0].evidencePackageId).toBe(pkg.recordId);
  });
  it('treats undocumented requested accommodation as a partial match', () => {
    expect(matches()[0].classification).toBe('partial_match'); expect(status(matches()[0], 'accommodation')).toBe('unknown');
  });
  it('does not interpret hospital stay as accommodation', () => {
    const m = matches(query, { ...snapshot, packages: [{ ...pkg, inclusions: ['Hospital stay'] }] })[0];
    expect(status(m, 'accommodation')).toBe('unknown');
  });
  it('classifies explicitly included accommodation as exact', () => {
    const m = matches(query, { ...snapshot, packages: [{ ...pkg, inclusions: ['Accommodation included'] }] })[0];
    expect(status(m, 'accommodation')).toBe('exact'); expect(m.classification).toBe('strong_match');
  });
  it('classifies excluded accommodation as an explicit failure', () => {
    const m = matches(query, { ...snapshot, packages: [{ ...pkg, exclusions: ['Accommodation'] }] })[0];
    expect(status(m, 'accommodation')).toBe('not_met'); expect(m.classification).toBe('does_not_match');
  });
  it('classifies an exceeded budget as does not match', () => {
    const m = matches(query, { ...snapshot, packages: [{ ...pkg, samplePriceUsd: 7200 }] })[0];
    expect(status(m, 'budget')).toBe('not_met'); expect(m.failedRequirements).toContain('budget'); expect(m.classification).toBe('does_not_match');
  });
  it('keeps missing packages unknown with insufficient evidence', () => {
    const m = matches(query, { ...snapshot, packages: [] })[0];
    expect(m.classification).toBe('insufficient_evidence'); expect(status(m, 'budget')).toBe('unknown');
    expect(m.criteria.find((c) => c.evaluation.type === 'budget')?.source).toBeUndefined(); expect(m.linkedPackages).toEqual([]);
  });
  it('keeps absent price information insufficient instead of failing', () => {
    const m = matches(query, { ...snapshot, packages: [{ ...pkg, samplePriceUsd: 0 }] })[0];
    expect(m.classification).toBe('insufficient_evidence'); expect(status(m, 'budget')).toBe('unknown');
  });
  it('preserves explicit incomplete package retrieval', () => {
    const m = matches(query, { ...snapshot, packages: [] }, false)[0];
    expect(status(m, 'budget')).toBe('incomplete'); expect(m.packageSearchComplete).toBe(false);
  });
  it('returns no invented hospital or package for an empty catalog', async () => {
    const response = await harness(unavailable, dependencies({ ...snapshot, hospitals: [], packages: [] })).send(query);
    expect(response.hospitalMatches).toEqual([]); expect(response.findings).toEqual([]); expect(response.summary).toContain('No sourced hospital record');
  });
  it('hands one hospital honestly to existing comparison', async () => {
    const response = await harness().send('Find knee replacement hospitals in Mumbai under $6000, show packages and compare them.');
    expect(response.summary).toContain("isn't a second sourced hospital"); expect(response.hospitalMatches).toHaveLength(1);
    expect(response.tasks.map((t) => t.tool)).toEqual(['search_hospitals', 'search_packages']);
  });
  it('evaluates multiple hospitals independently and orders requirement satisfaction', async () => {
    const secondHospital = { ...hospital, recordId: randomUUID(), slug: 'second-hospital', name: 'Second Hospital' };
    const secondPackage = { ...pkg, recordId: randomUUID(), slug: 'second-package', hospitalSlug: secondHospital.slug, hospitalName: secondHospital.name,
      samplePriceUsd: 7200, inclusions: ['Accommodation'] };
    const data = { ...snapshot, hospitals: [secondHospital, hospital], packages: [secondPackage, pkg] };
    const response = await harness(unavailable, dependencies(data)).send(query);
    expect(response.hospitalMatches?.map((m) => m.classification)).toEqual(['partial_match', 'does_not_match']);
    expect(response.resultGroups?.[0].findings.map((f) => f.slug)).toEqual([hospital.slug, secondHospital.slug]);
    expect(response.referenceContext?.groups[0].references.map((r) => r.slug)).toEqual([hospital.slug, secondHospital.slug]);
  });
  it('never combines features and budget from different packages', () => {
    const second = { ...pkg, recordId: randomUUID(), slug: 'expensive-with-hotel', samplePriceUsd: 7200, inclusions: ['Accommodation'] };
    const m = matches(query, { ...snapshot, packages: [pkg, second] })[0];
    expect(m.classification).toBe('partial_match'); expect(m.evidencePackageId).toBe(pkg.recordId);
    expect(status(m, 'accommodation')).toBe('unknown'); expect(m.linkedPackages[1].classification).toBe('does_not_match');
  });
  it('rejects forged finding identities and associations', () => {
    const bad = { ...toFinding('packages', pkg, 'exact', 'Catalog'), slug: 'forged', facts: { hospitalId: hospital.recordId } };
    const m = HospitalMatchingAgent.match({ requirements: RequirementExtractor.extract(query, snapshot), requestedOperations: ['discover_hospitals', 'discover_packages'] },
      [toFinding('hospitals', hospital, 'exact', 'Catalog')], [bad], snapshot)[0];
    expect(m.linkedPackages).toEqual([]);
  });
  it('lists unknown accommodation only when requested', async () => {
    const response = await harness().send('Find knee replacement hospitals in Mumbai under $6000.');
    expect(response.hospitalMatches![0].missingInformation).toEqual([]); expect(response.summary).not.toMatch(/accommodation|No applicable requested criteria are missing/i);
  });
  it('resolves hospital, linked package and revised budget through existing references', async () => {
    const h = harness(); const first = await h.send(query);
    const detail = await h.send('Tell me more about the first hospital.', first.conversationId);
    expect(detail.referenceResolution?.reference?.slug).toBe(hospital.slug); expect(detail.tasks.map((t) => t.tool)).toEqual(['get_hospital']);
    const linked = await h.send('Show me its package.', first.conversationId);
    expect(linked.findings[0].slug).toBe(pkg.slug); expect(linked.findings[0].facts.hospitalSlug).toBe(hospital.slug);
    const budget = await h.send('Is it under $5000?', first.conversationId);
    expect(budget.plan?.context.budget?.amount).toBe(5000); expect(budget.findings[0].slug).toBe(pkg.slug);
    expect(budget.findings[0].requirementEvaluation?.evaluations.find((e) => e.type === 'budget')?.status).toBe('not_met');
    expect(budget.plan?.tasks.find((t) => t.hospitalMatches)?.hospitalMatches?.[0].classification).toBe('does_not_match');
  });
  it('retains procedure, revised budget and package intent when changing city', async () => {
    const h = harness(); const first = await h.send(query);
    await h.send('Show me its package.', first.conversationId); await h.send('Is it under $5000?', first.conversationId);
    const changed = await h.send('What about Pune?', first.conversationId);
    expect(changed.plan?.context).toMatchObject({ treatmentSlug: 'knee-replacement', city: 'Pune', budget: { amount: 5000 }, requestedTargets: ['hospitals', 'packages'] });
    expect(changed.hospitalMatches).toEqual([]); expect(changed.findings).toEqual([]);
  });
  it('passes the same ordered sourced set to city comparison without a second search', async () => {
    const h = harness(); const first = await h.send(query);
    const compared = await h.send('Compare Mumbai and Pune.', first.conversationId);
    expect(compared.comparison?.sides[0].groups[0].findings[0].provenance.recordId).toBe(first.hospitalMatches![0].hospital.provenance.recordId);
    expect(compared.comparison?.sides[1].groups.every((g) => !g.findings.length)).toBe(true);
    expect(compared.tasks.map((t) => t.tool)).toEqual(['search_hospitals']);
  });
  it('restores strict hospital match metadata and references after a JSON roundtrip', async () => {
    const h = harness(); const first = await h.send(query);
    const restored = assistantResponseSchema.parse(JSON.parse(JSON.stringify(first)));
    expect(restored.hospitalMatches).toEqual(first.hospitalMatches);
    const plan = await h.planningStore.load(first.conversationId, userId);
    expect(plan?.tasks.find((t) => t.hospitalMatches)?.hospitalMatches).toEqual(first.hospitalMatches);
    h.planningStore.plans.set(first.conversationId, JSON.parse(JSON.stringify(plan)));
    expect((await h.send('Tell me more about the first one.', first.conversationId)).findings[0].slug).toBe(hospital.slug);
  });
  it('keeps results isolated by owner and refuses a foreign conversation', async () => {
    const h = harness(); const first = await h.send(query);
    expect(await h.planningStore.load(first.conversationId, randomUUID())).toBeUndefined();
    await expect(harness().send('Tell me more about the first hospital.', first.conversationId)).rejects.toMatchObject({ code: 'CONVERSATION_ACCESS_DENIED' });
  });
  it('reuses unchanged catalog searches after a budget-only change', async () => {
    const h = harness(); const first = await h.send(query);
    expect((await h.send(query, first.conversationId)).tasks).toEqual([]);
    const changed = await h.send('Find knee replacement hospitals in Mumbai under $5000 with accommodation.', first.conversationId);
    expect(changed.tasks).toEqual([]); expect(status(changed.hospitalMatches![0], 'budget')).toBe('not_met');
  });
  it('preserves doctor discovery and unsupported procedure behavior', async () => {
    const doctor = await harness().send('Find a heart doctor in Mumbai.'); expect(doctor.agent).toBe('discovery');
    const unsupported = await harness().send('Find hospitals for underwater brain surgery in Mumbai.');
    expect(unsupported.agent).toBe('discovery'); expect(unsupported.findings.every((f) => f.kind === 'treatments' && f.matchType === 'related')).toBe(true);
  });
  it('retrieves and evaluates duration at package level without inventing a budget', async () => {
    const response = await harness().send('Find knee replacement hospitals in Mumbai with packages under 5 days.');
    expect(response.tasks.map((t) => t.tool)).toEqual(['search_hospitals', 'search_packages']);
    expect(response.requirements?.some((r) => r.type === 'budget')).toBe(false);
    expect(status(response.hospitalMatches![0], 'duration')).toBe('not_met');
    expect(response.hospitalMatches![0].classification).toBe('does_not_match');
  });
  it('uses existing service search while leaving hospital-specific service availability unknown', async () => {
    const response = await harness().send('Find knee replacement hospitals in Mumbai with consultation services.');
    expect(response.tasks.map((t) => t.tool)).toEqual(['search_hospitals', 'search_services', 'search_packages']);
    expect(status(response.hospitalMatches![0], 'service')).toBe('unknown');
    expect(response.resultGroups?.find((g) => g.target === 'services')?.findings[0].slug).toBe('consultation');
    expect(response.hospitalMatches![0].classification).toBe('partial_match');
  });
  it('preserves completed hospital evidence when another hospital package search is incomplete', () => {
    const second = { ...hospital, recordId: randomUUID(), slug: 'other', name: 'Other' };
    const data = { ...snapshot, hospitals: [hospital, second] };
    const result = HospitalMatchingAgent.match({ requirements: RequirementExtractor.extract('Find knee replacement hospitals in Mumbai under $6000.', data),
      requestedOperations: ['discover_hospitals', 'discover_packages'] }, data.hospitals.map((h) => toFinding('hospitals', h, 'exact', 'Catalog')),
      [toFinding('packages', pkg, 'exact', 'Catalog')], data, new Map([[hospital.recordId, true], [second.recordId, false]]));
    expect(result.map((m) => m.classification)).toEqual(['strong_match', 'insufficient_evidence']);
  });
  it('reuses explicit specialty hospital searches against the specialties array', async () => {
    const h = harness(); const query = 'Find Orthopedics hospitals in Mumbai.';
    const first = await h.send(query);
    expect(first.hospitalMatches).toHaveLength(1); expect(first.requirements?.find((r) => r.type === 'specialty')?.value).toBe('Orthopedics');
    expect((await h.send(query, first.conversationId)).tasks).toEqual([]);
  });
  it('retrieves cost evidence and keeps an undocumented requested price insufficient', async () => {
    const response = await harness(unavailable, dependencies({ ...snapshot, packages: [{ ...pkg, samplePriceUsd: 0 }] }))
      .send('Find knee replacement hospitals in Mumbai and check the cost.');
    expect(response.tasks.map((t) => t.tool)).toEqual(['search_hospitals', 'search_packages']);
    expect(status(response.hospitalMatches![0], 'price')).toBe('unknown');
    expect(response.hospitalMatches![0].classification).toBe('insufficient_evidence');
  });
  it('aligns destination comparison, match overview and ordinal references with the displayed sides', async () => {
    const puneHospital = { ...hospital, recordId: randomUUID(), slug: 'pune-hospital', name: 'Pune Hospital', city: 'Pune' };
    const punePackage = { ...pkg, recordId: randomUUID(), slug: 'pune-package', hospitalSlug: puneHospital.slug, hospitalName: puneHospital.name, samplePriceUsd: 7200 };
    const h = harness(unavailable, dependencies({ ...snapshot, hospitals: [hospital, puneHospital], packages: [pkg, punePackage] }));
    const response = await h.send('Find knee replacement hospitals in Pune and Mumbai under $6000, show packages and compare them.');
    expect(response.hospitalMatches?.map((m) => m.hospital.slug)).toEqual([puneHospital.slug, hospital.slug]);
    expect(response.hospitalMatches?.map((m) => m.classification)).toEqual(['does_not_match', 'strong_match']);
    expect(response.plan?.tasks.find((t) => t.hospitalMatches)?.hospitalMatches?.map((m) => m.hospital.slug)).toEqual([puneHospital.slug, hospital.slug]);
    expect(response.referenceContext?.groups.filter((g) => g.entityType === 'hospital').flatMap((g) => g.references.map((r) => r.slug)))
      .toEqual([puneHospital.slug, hospital.slug]);
    expect((await h.send('Tell me more about the first hospital.', response.conversationId)).findings[0].slug).toBe(puneHospital.slug);
  });
  it('evaluates all displayed linked packages while respecting the flat response record bound', async () => {
    const hospitals = Array.from({ length: 5 }, (_, i) => ({ ...hospital, recordId: randomUUID(), slug: `hospital-${i}`, name: `Hospital ${i}` }));
    const packages = hospitals.flatMap((h, i) => Array.from({ length: 5 }, (_, j) => ({ ...pkg, recordId: randomUUID(), slug: `package-${i}-${j}`,
      name: `Package ${i} ${j}`, hospitalSlug: h.slug, hospitalName: h.name })));
    const response = await harness(unavailable, dependencies({ ...snapshot, hospitals, packages }))
      .send('Find knee replacement hospitals in Mumbai, find doctors and check their packages.');
    expect(response.status).toBe('completed'); expect(response.findings).toHaveLength(30);
    expect(response.resultGroups?.find((g) => g.target === 'packages')?.findings).toHaveLength(25);
    expect(response.hospitalMatches?.map((m) => m.linkedPackages.length)).toEqual([5, 5, 5, 5, 5]);
    expect(response.tasks).toHaveLength(7);
  });
});
