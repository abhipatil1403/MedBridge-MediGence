import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
vi.mock('server-only', () => ({}));
import { harness, snapshot, tools, unavailable, pkg, hospital } from './fixtures/comparison-harness';
import { parseCompoundIntent } from '@/lib/orchestration/CompoundIntentParser';
import { compoundRequestSchema } from '@/lib/orchestration/CompoundRequest';
import { RequirementExtractor } from '@/lib/requirements/RequirementExtractor';
import { AgentError } from '@/lib/agents/errors';
import { SearchService } from '@/lib/discovery/search-service';

export const compoundRegression = "I need knee replacement in Mumbai under $6,000. Find hospitals that fit, check their packages, tell me what's missing, and help me compare them.";
const parse = (content: string) => parseCompoundIntent(content, RequirementExtractor.extract(content, snapshot));

describe('compound intent orchestration', () => {
  it('extracts the regression operations and supplied requirements without clarification', async () => {
    expect(parse(compoundRegression)?.operations.map((o) => o.type)).toEqual(['discover_hospitals', 'discover_packages', 'evaluate_requirements', 'compare_results']);
    const response = await harness().send(compoundRegression);
    expect(response.question).toBeNull(); expect(response.status).toBe('completed');
    expect(response.requirements).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'procedure', value: 'knee-replacement', matchType: 'exact' }),
      expect.objectContaining({ type: 'location', places: [{ type: 'city', value: 'Mumbai', label: 'Mumbai' }] }), expect.objectContaining({ type: 'budget', maximum: 6000, currency: 'USD' })]));
    expect(response.tasks.map((t) => t.tool)).toEqual(['search_hospitals', 'search_packages']);
    expect(response.findings.map((f) => f.kind)).toEqual(['hospitals', 'packages']);
    expect(response.summary).not.toMatch(/What treatment|What specialty/);
  });
  it('finds hospitals then their verified packages', async () => {
    const searches = vi.fn(tools.search);
    const response = await harness(unavailable, { ...tools, search: searches }).send('Find knee replacement hospitals in Mumbai and show me their packages.');
    expect(response.compoundRequest?.operations.map((o) => o.type)).toEqual(['discover_hospitals', 'discover_packages']);
    expect(searches.mock.calls[1][2]).toMatchObject({ hospital: hospital.slug, treatment: 'knee-replacement', city: 'Mumbai' });
    expect(response.findings[1].facts).toMatchObject({ hospitalId: hospital.recordId, hospitalSlug: hospital.slug, hospitalName: hospital.name });
    expect(response.findings[1].requirementEvaluation?.evaluations.find((e) => e.type === 'budget')).toBeUndefined();
  });
  it('orders comparison after packages even when mentioned earlier', async () => {
    const response = await harness().send('Find hospitals for knee replacement in Mumbai, compare them, and show packages.');
    expect(response.compoundRequest?.operations.map((o) => o.type)).toEqual(['discover_hospitals', 'discover_packages', 'evaluate_requirements', 'compare_results']);
    expect(response.compoundRequest?.operations.at(-1)?.dependsOn).toEqual(['evaluate_requirements']);
    expect(response.tasks.map((t) => t.tool)).toEqual(['search_hospitals', 'search_packages']);
  });
  it('compares two cities and packages with known treatment and budget, preserving the empty city', async () => {
    const response = await harness().send('Compare knee replacement in Pune and Mumbai and show packages under $6000.');
    expect(response.question).toBeNull(); expect(response.comparison?.request.subject?.slug).toBe('knee-replacement');
    expect(response.comparison?.request.budget?.amount).toBe(6000);
    expect(response.comparison?.sides.map((s) => s.option.value)).toEqual(['Pune', 'Mumbai']);
    expect(response.comparison?.sides[0].groups[0].findings).toEqual([]);
  });
  it('reports one hospital honestly without inventing another', async () => {
    const response = await harness().send(compoundRegression);
    expect(response.summary).toContain("isn't a second sourced hospital"); expect(response.comparison).toBeUndefined();
    expect(response.compoundRequest?.operations.at(-1)?.status).toBe('incomplete');
  });
  it('does not execute hospital-linked packages without hospitals', async () => {
    const search = vi.fn(async (...args: Parameters<typeof tools.search>) => { const result = await tools.search(...args); return { ...result, sections: { ...result.sections, hospitals: [] } }; });
    const response = await harness(unavailable, { ...tools, search }).send(compoundRegression);
    expect(search).toHaveBeenCalledTimes(1); expect(response.findings).toEqual([]);
    expect(response.compoundRequest?.operations.find((o) => o.type === 'discover_packages')?.status).toBe('skipped');
  });
  it('keeps hospitals when no linked package is available', async () => {
    const search = async (...args: Parameters<typeof tools.search>) => { const result = await tools.search(...args); return args[1] === 'packages' ? { ...result, sections: { ...result.sections, packages: [] } } : result; };
    const response = await harness(unavailable, { ...tools, search }).send(compoundRegression);
    expect(response.findings.map((f) => f.kind)).toEqual(['hospitals']);
    expect(response.resultGroups?.find((g) => g.target === 'packages')).toMatchObject({ findings: [], matchType: 'none', status: 'completed' });
    expect(response.summary).toContain('No sourced packages');
  });
  it('preserves successful operations on a package failure', async () => {
    const search = async (...args: Parameters<typeof tools.search>) => { if (args[1] === 'packages') throw new AgentError('DATABASE_FAILURE', 'Failed'); return tools.search(...args); };
    const response = await harness(unavailable, { ...tools, search }).send(compoundRegression);
    expect(response.findings.map((f) => f.kind)).toEqual(['hospitals']); expect(response.status).toBe('completed');
    expect(response.compoundRequest?.operations.find((o) => o.type === 'discover_packages')?.status).toBe('incomplete');
    expect(response.compoundRequest?.operations.at(-1)?.status).toBe('skipped');
    expect(response.tasks.at(-1)?.status).toBe('failed');
  });
  it('blocks dependent packages after a failed hospital operation', async () => {
    const search = vi.fn(async () => { throw new AgentError('DATABASE_FAILURE', 'Failed'); });
    const response = await harness(unavailable, { ...tools, search }).send(compoundRegression);
    expect(search).toHaveBeenCalledTimes(1); expect(response.compoundRequest?.operations[0].status).toBe('incomplete');
    expect(response.compoundRequest?.operations[1].status).toBe('skipped');
  });
  it('resolves hospital and its package, then evaluates its new budget with no model', async () => {
    const model = vi.fn(async () => { throw new Error('No model calls needed'); });
    const h = harness({ generateStructured: model }); const first = await h.send(compoundRegression);
    const detail = await h.send('Tell me more about the first hospital.', first.conversationId);
    expect(detail.referenceResolution?.reference?.entityId).toBe(hospital.recordId);
    const packages = await h.send('Show me its package.', first.conversationId);
    expect(packages.findings[0].facts.hospitalSlug).toBe(hospital.slug);
    const budget = await h.send('Is it under $5,000?', first.conversationId);
    expect(budget.findings[0].slug).toBe(pkg.slug); expect(budget.tasks.map((t) => t.tool)).toEqual(['get_package']);
    expect(budget.findings[0].requirementEvaluation?.evaluations.find((e) => e.type === 'budget')?.status).toBe('not_met');
    expect(model).not.toHaveBeenCalled();
  });
  it('reloads persisted context, retaining requirements and entity references', async () => {
    const h = harness(); const response = await h.send(compoundRegression);
    const restored = await h.planningStore.load(response.conversationId, response.plan!.userId);
    expect(compoundRequestSchema.parse(restored?.context.compoundRequest)).toEqual(response.compoundRequest);
    expect(h.outputs.at(-1)?.referenceContext?.groups.map((g) => g.entityType)).toEqual(['hospital', 'package']);
    h.planningStore.plans.set(response.conversationId, JSON.parse(JSON.stringify(restored)));
    expect((await h.send('Tell me more about the first package.', response.conversationId)).findings[0].slug).toBe(pkg.slug);
  });
  it('preserves treatment, budget and package requirement on a new location', async () => {
    const h = harness(); const response = await h.send(compoundRegression);
    const pune = await h.send('What about Pune?', response.conversationId);
    expect(pune.plan?.context).toMatchObject({ city: 'Pune', treatmentSlug: 'knee-replacement', budget: { amount: 6000 }, requestedTargets: ['hospitals', 'packages'] });
    const compared = await h.send('Compare Mumbai and Pune.', response.conversationId);
    expect(compared.question).toBeNull(); expect(compared.comparison?.request.subject?.slug).toBe('knee-replacement');
  });
  it('coordinates hospital discovery with the same sourced catalog identity', async () => {
    const response = await harness().send('Find hospitals for knee replacement in Mumbai.');
    expect(response.agent).toBe('hospital_matching'); expect(response.compoundRequest?.operations.map((o) => o.type)).toEqual(['discover_hospitals', 'evaluate_requirements']); expect(response.findings[0].slug).toBe(hospital.slug);
  });
  it('leaves the existing comparison workflow unchanged', async () => {
    const response = await harness().send('Compare knee replacement in Pune and Mumbai.');
    expect(response.agent).toBe('comparison'); expect(response.compoundRequest).toBeUndefined(); expect(response.comparison?.sides).toHaveLength(2);
  });
  it('leaves single planning unchanged', async () => {
    const response = await harness().send('I need knee replacement treatment in Mumbai.');
    expect(response.agent).toBe('treatment_planning'); expect(response.compoundRequest).toBeUndefined(); expect(response.tasks.map((t) => t.tool)).toEqual(['search_hospitals', 'search_packages']);
  });
  it('keeps accommodation unknown unless catalog evidence supports it', async () => {
    const response = await harness().send(`${compoundRegression} I want accommodation.`);
    expect(response.findings.find((f) => f.kind === 'packages')?.requirementEvaluation?.evaluations.find((e) => e.type === 'accommodation')?.status).toBe('unknown');
    expect(response.summary).toContain('Accommodation: unknown'); expect(response.summary).toContain("isn't a second sourced hospital");
  });
  it('reuses identical completed searches', async () => {
    const h = harness(); const response = await h.send(compoundRegression);
    expect((await h.send(compoundRegression, response.conversationId)).tasks).toEqual([]);
  });
  it('refreshes cached facts and invalidates a changed hospital association', async () => {
    let current = snapshot;
    const repository = { ...tools.repository, loadSnapshot: async () => current, listPackages: async () => current.packages, listHospitals: async () => current.hospitals };
    const search = new SearchService(repository);
    const h = harness(unavailable, { ...tools, repository, search: (q, type, filters) => search.search({ q, type, ...filters, sort: 'relevance' }) });
    const first = await h.send(compoundRegression);
    current = { ...snapshot, packages: [{ ...pkg, samplePriceUsd: 6200 }] };
    const priceChanged = await h.send(compoundRegression, first.conversationId);
    expect(priceChanged.tasks.map((t) => t.tool)).toEqual(['search_packages']); expect(priceChanged.findings.find((f) => f.kind === 'packages')?.facts.samplePriceUsd).toBe(6200);
    expect(priceChanged.findings.find((f) => f.kind === 'packages')?.requirementEvaluation?.evaluations.find((e) => e.type === 'budget')?.status).toBe('not_met');
    current = { ...snapshot, packages: [{ ...pkg, hospitalSlug: 'different-hospital' }] };
    const moved = await h.send(compoundRegression, first.conversationId);
    expect(moved.tasks.map((t) => t.tool)).toEqual(['search_packages']);
    expect(moved.findings.map((f) => f.kind)).toEqual(['hospitals']);
  });
  it('invalidates cached empty searches when the published catalog gains candidates', async () => {
    let current = { ...snapshot, hospitals: [], packages: [] } as typeof snapshot;
    const repository = { ...tools.repository, loadSnapshot: async () => current, listPackages: async () => current.packages, listHospitals: async () => current.hospitals };
    const search = new SearchService(repository);
    const h = harness(unavailable, { ...tools, repository, search: (q, type, filters) => search.search({ q, type, ...filters, sort: 'relevance' }) });
    const first = await h.send(compoundRegression); expect(first.findings).toEqual([]);
    current = snapshot;
    const added = await h.send(compoundRegression, first.conversationId);
    expect(added.findings.map((f) => f.kind)).toEqual(['hospitals', 'packages']);
    expect(added.tasks.map((t) => t.tool)).toEqual(['search_hospitals', 'search_packages']);
  });
  it('rejects forward dependencies and never promotes unsupported procedures to exact matches', async () => {
    const request = parse(compoundRegression)!; request.operations[0].dependsOn = ['compare_results'];
    expect(compoundRequestSchema.safeParse(request).success).toBe(false);
    const response = await harness().send('Find hospitals for underwater brain surgery in Mumbai and show their packages.');
    expect(response.findings).toEqual([]); expect(response.tasks).toEqual([]);
  });
  it('does not mistake a hospital association for a requested hospital search', () => {
    expect(parse('Find packages for knee replacement in Mumbai from hospitals and compare them.')?.operations.map((o) => o.type))
      .toEqual(['discover_packages', 'evaluate_requirements', 'compare_results']);
  });
  it('keeps explicit independent searches independent and handles missing procedure honestly', async () => {
    const request = parse('Find doctors for knee replacement in Mumbai and show packages.')!;
    expect(request.operations.find((o) => o.type === 'discover_packages')?.dependsOn).toEqual([]);
    const response = await harness().send('Find hospitals in Mumbai and show their packages.');
    expect(response.question).toMatch(/treatment or specialty/); expect(response.tasks).toEqual([]);
  });
  it('retains ordinal order across multiple packages', async () => {
    const second = { ...pkg, recordId: randomUUID(), slug: 'second-package', name: 'Second Package', samplePriceUsd: 5900 };
    const customSnapshot = { ...snapshot, packages: [pkg, second] };
    const dependencies = { ...tools, repository: { ...tools.repository, loadSnapshot: async () => customSnapshot, listPackages: async () => customSnapshot.packages },
      search: async (...args: Parameters<typeof tools.search>) => { const result = await tools.search(...args); return args[1] === 'packages' ? { ...result, sections: { ...result.sections, packages: [...result.sections.packages, { ...result.sections.packages[0], item: second }] } } : result; } };
    const h = harness(unavailable, dependencies); const response = await h.send(compoundRegression);
    expect(response.findings.filter((f) => f.kind === 'packages')).toHaveLength(2);
    expect((await h.send('Tell me more about the second package.', response.conversationId)).findings[0].slug).toBe(second.slug);
    const compared = await h.send('Compare those two.', response.conversationId);
    expect(compared.question).toBeNull(); expect(compared.findings.map((f) => f.slug)).toEqual([pkg.slug, second.slug]);
    expect(compared.tasks.map((t) => t.tool)).toEqual(['get_package', 'get_package']);
  });
});
