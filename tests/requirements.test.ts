import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
vi.mock('server-only', () => ({}));
import { harness, snapshot, tools, pkg, hospital } from './fixtures/comparison-harness';
import { SearchService } from '@/lib/discovery/search-service';
import { executeTool } from '@/lib/agents/tools';
import { assistantResponseSchema, carePlanSchema, type Finding } from '@/lib/agents/schemas';
import { RequirementExtractor } from '@/lib/requirements/RequirementExtractor';
import { extractBudget } from '@/lib/requirements/RequirementNormalizer';
import { RequirementEvaluator } from '@/lib/requirements/RequirementEvaluator';
import { evaluateFindings } from '@/lib/requirements/response';
import type { CatalogSnapshot } from '@/types/catalog';

const request = 'I need knee replacement in Mumbai, under $6,000, and I want a package with accommodation.';
function setup() {
  const pune = { ...hospital, recordId: randomUUID(), slug: 'pune-demo', name: 'Pune Demo Hospital', city: 'Pune' };
  const data: CatalogSnapshot = { ...snapshot, hospitals: [hospital, pune], packages: [{ ...pkg, samplePriceUsd: 4700, inclusions: ['Illustrative hospital stay', 'Illustrative procedure coordination', 'Illustrative discharge planning'] }] };
  const repository = { ...tools.repository, loadSnapshot: async () => data, listHospitals: async () => data.hospitals, listPackages: async () => data.packages };
  const search = new SearchService(repository);
  const dependencies = { ...tools, repository, search: (q: string, type: Parameters<typeof tools.search>[1], filters: Parameters<typeof tools.search>[2]) => search.search({ q, type, ...filters, sort: 'relevance' }) };
  return { ...harness(undefined, dependencies), data, dependencies, pune };
}
const statuses = (finding: Finding) => Object.fromEntries(finding.requirementEvaluation!.evaluations.map((e) => [e.type, e.status]));
async function finding(data: CatalogSnapshot) {
  return (await executeTool('get_package', { slug: pkg.slug }, { agent: 'discovery', userId: randomUUID(), caseAccess: { readContext: async () => ({}), readDocumentMetadata: async () => [] } }, { ...tools, repository: { ...tools.repository, listPackages: async () => data.packages } })).findings[0];
}

describe('requirement extraction, evidence and integration', () => {
  it('fixes the actual accommodation failure independently of treatment/location/budget/package', async () => {
    const h = setup(), result = await h.send(request), record = result.findings.find((f) => f.kind === 'packages')!;
    expect(statuses(record)).toMatchObject({ procedure: 'exact', location: 'exact', budget: 'exact', package: 'exact', accommodation: 'unknown' });
    expect(record.requirementEvaluation?.overallStatus).toBe('partially_satisfies');
    expect(result.summary).toMatch(/does not explicitly confirm accommodation/);
    expect(result.plan?.context.budget).toEqual({ amount: 6000, currency: 'USD', source: 'user' });
    expect(assistantResponseSchema.safeParse(result).success).toBe(true);
    expect(h.outputs.at(-1)?.requirements?.find((r) => r.type === 'accommodation')).toBeDefined();
  });
  it.each([
    ['accommodation included', 'exact'], ['accommodation not included', 'not_met'], ['hospital stay', 'unknown'],
    ['procedure coordination; discharge planning', 'unknown'], ['hotel included', 'unknown'], ['companion accommodation included', 'unknown'],
    ['accommodation available on request', 'incomplete'],
    ['Accommodation not specified', 'unknown'], ['Accommodation coordination', 'unknown'], ['Accommodation booking assistance', 'unknown'], ['Accommodation included?', 'unknown'],
  ])('uses explicit inclusion evidence: %s -> %s', async (inclusion, status) => {
    const h = setup(); h.data.packages = [{ ...h.data.packages[0], inclusions: [inclusion] }];
    const reqs = RequirementExtractor.extract(request, h.data);
    const result = RequirementEvaluator.evaluate(await finding(h.data), reqs, h.data);
    expect(result.evaluations.find((e) => e.type === 'accommodation')?.status).toBe(status);
    expect(result.evaluations.every((e) => e.explanation.length > 0)).toBe(true);
  });
  it('handles explicit exclusions and conflicting statements', async () => {
    const h = setup(), reqs = RequirementExtractor.extract(request, h.data);
    h.data.packages = [{ ...pkg, exclusions: ['Accommodation'] }];
    expect(RequirementEvaluator.evaluate(await finding(h.data), reqs, h.data).evaluations.at(-1)?.status).toBe('not_met');
    h.data.packages = [{ ...pkg, inclusions: ['Accommodation included'], exclusions: ['Accommodation'] }];
    expect(RequirementEvaluator.evaluate(await finding(h.data), reqs, h.data).evaluations.at(-1)?.status).toBe('incomplete');
  });
  it.each([['under $6000', 'USD', 6000, 'lt'], ['below $5,000', 'USD', 5000, 'lt'], ['maximum budget ₹5 lakh', 'INR', 500000, 'lte'],
    ['within USD 6000', 'USD', 6000, 'lte'], ['less than 5000 dollars', 'USD', 5000, 'lt'], ['My budget is INR 600000', 'INR', 600000, 'lte'],
    ['$6000 budget', 'USD', 6000, 'lte'], ['at most 6000', 'unspecified', 6000, 'lte']])('normalizes %s without currency conversion', (text, currency, maximum, operator) => {
    expect(extractBudget(text)).toMatchObject({ currency, maximum, operator, originalExpression: text });
  });
  it('retains minimum/range/equality budget semantics', () => {
    expect(extractBudget('at least $3000')).toMatchObject({ minimum: 3000, operator: 'gte', currency: 'USD' });
    expect(extractBudget('between $3000 and $6000')).toMatchObject({ minimum: 3000, maximum: 6000, operator: 'range', currency: 'USD' });
    expect(extractBudget('exactly USD 4700')).toMatchObject({ minimum: 4700, maximum: 4700, operator: 'eq' });
  });
  it.each([[4700, 'exact'], [6500, 'not_met'], [6000, 'not_met'], [0, 'unknown']])('evaluates USD %s under USD 6000 -> %s', async (price, status) => {
    const h = setup(); h.data.packages = [{ ...pkg, samplePriceUsd: price }];
    const evaluation = RequirementEvaluator.evaluate(await finding(h.data), RequirementExtractor.extract(request, h.data), h.data);
    expect(evaluation.evaluations.find((e) => e.type === 'budget')).toMatchObject({ status, sourceFields: ['samplePriceUsd'] });
  });
  it('never converts INR or unspecified currencies into USD evidence', async () => {
    const h = setup(); for (const text of ['within INR 6000', 'within 6000']) {
      expect(RequirementEvaluator.evaluate(await finding(h.data), [extractBudget(text)!], h.data).evaluations[0].status).toBe('unknown');
    }
  });
  it('retains all requirements for another package and never invents an alternative', async () => {
    const h = setup(), first = await h.send(request), another = await h.send('Show me another one.', first.conversationId);
    expect(another.requirements).toEqual(first.requirements); expect(another.findings).toEqual([]);
    expect(another.summary).toContain('No additional'); expect(another.plan?.context.requirements).toEqual(first.requirements);
  });
  it('changes only location on What about Pune, then independently evaluates both comparison destinations', async () => {
    const h = setup(); h.data.packages = [...h.data.packages, { ...pkg, recordId: randomUUID(), slug: 'pune-package', hospitalSlug: h.pune.slug, hospitalName: h.pune.name, inclusions: ['Accommodation included'] }];
    const first = await h.send(request), pune = await h.send('What about Pune?', first.conversationId);
    expect(pune.plan?.context.city).toBe('Pune'); expect(pune.requirements?.filter((r) => r.type !== 'location')).toEqual(first.requirements?.filter((r) => r.type !== 'location'));
    const compared = await h.send('Compare Mumbai and Pune.', first.conversationId);
    expect(compared.question, compared.summary).toBeNull();
    const groups = compared.comparison!.sides.map((side) => side.groups.find((g) => g.target === 'packages')!);
    expect(statuses(groups[0].findings[0]).accommodation).toBe('unknown'); expect(statuses(groups[1].findings[0]).accommodation).toBe('exact');
    expect(groups.every((g) => statuses(g.findings[0]).location === 'exact')).toBe(true);
    const follow = await h.send('Compare these two.', first.conversationId);
    expect(follow.requirements?.find((r) => r.type === 'accommodation')).toBeDefined(); expect(follow.comparison?.sides).toHaveLength(2);
    expect(follow.summary).not.toMatch(/better|best|recommended/);
  });
  it('answers inclusion questions from a referenced package with no unrelated search', async () => {
    const h = setup(), first = await h.send(request);
    const next = await h.send('Does the package include accommodation?', first.conversationId);
    expect(next.tasks.map((t) => t.tool)).toEqual(['get_package']); expect(next.referenceResolution?.reference?.entityId).toBe(pkg.recordId);
    expect(statuses(next.findings[0]).accommodation).toBe('unknown');
    const itQuestion = await h.send('Does it include hotel?', first.conversationId);
    expect(itQuestion.tasks[0].tool).toBe('get_package'); expect(statuses(itQuestion.findings[0]).hotel).toBe('unknown');
  });
  it('resolves the second package from the actual ranked/displayed context', async () => {
    const h = setup(); h.data.packages = [...h.data.packages, { ...pkg, recordId: randomUUID(), slug: 'confirmed-package', inclusions: ['Accommodation included'] }];
    const first = await h.send(request); expect(first.findings[0].slug).toBe('confirmed-package');
    const next = await h.send('Does the second package include accommodation?', first.conversationId);
    expect(next.findings[0].slug).toBe(pkg.slug); expect(next.tasks[0].tool).toBe('get_package'); expect(statuses(next.findings[0]).accommodation).toBe('unknown');
  });
  it('survives serialized server state with requirements and evaluations; forged facts cannot become evidence', async () => {
    const h = setup(), first = await h.send(request);
    const persisted = carePlanSchema.parse(JSON.parse(JSON.stringify(h.planningStore.plans.get(first.conversationId))));
    h.planningStore.plans.set(first.conversationId, persisted);
    const messages = JSON.parse(JSON.stringify(h.planningStore.messages.get(first.conversationId)));
    messages[1].metadata.response.findings[0].facts.inclusions = 'Accommodation included'; h.planningStore.messages.set(first.conversationId, messages);
    const next = await h.send('Tell me more about the first package.', first.conversationId);
    expect(next.requirements).toEqual(first.requirements); expect(statuses(next.findings[0]).accommodation).toBe('unknown');
    expect(next.plan?.findings[0].requirementEvaluation).toBeDefined();
  });
  it('keeps package-only criteria not applicable to hospital records', async () => {
    const h = setup(); const response = await h.send('Find hospitals and packages for knee replacement in Mumbai under $6000 with accommodation.');
    const hos = response.findings.find((f) => f.kind === 'hospitals')!;
    expect(statuses(hos)).toMatchObject({ procedure: 'exact', location: 'exact', budget: 'not_applicable', package: 'not_applicable', accommodation: 'not_applicable' });
  });
  it('recognizes all package feature requirements independently, without synonym inference', () => {
    const h = setup(); const text = 'I want a package with accommodation, hotel, hospital stay, flights, visa, airport transfer, interpreter, meals, local transport, follow-up, consultation, diagnostics, rehabilitation, nursing care and companion accommodation.';
    const reqs = RequirementExtractor.extract(text, h.data);
    expect(reqs.map((r) => r.type)).toEqual(expect.arrayContaining(['package', 'accommodation', 'hotel', 'hospital_stay', 'flights', 'visa', 'airport_transfer', 'interpreter', 'meals', 'local_transport', 'follow_up', 'consultation', 'diagnostics', 'rehabilitation', 'nursing_care', 'companion_accommodation']));
  });
  it('requires exact catalog identity and never treats demo verification or availability as suitability', async () => {
    const h = setup(), first = await h.send(request), record = first.findings[0];
    const reqs = RequirementExtractor.extract('I need a verified provider with clinical suitability and accommodation.', h.data);
    const evaluation = RequirementEvaluator.evaluate(record, reqs, h.data);
    expect(evaluation.evaluations.find((e) => e.type === 'verified')?.status).not.toBe('exact');
    expect(evaluation.evaluations.find((e) => e.type === 'clinical_suitability')?.status).toBe('unknown');
    const wrong = { ...record, provenance: { ...record.provenance, recordId: randomUUID() } };
    expect(RequirementEvaluator.evaluate(wrong, first.requirements!, h.data).overallStatus).toBe('insufficient_evidence');
  });
  it('keeps over-budget/unknown useful packages when requested features require evaluation and ranks by actual evidence', async () => {
    const h = setup(); h.data.packages = [...h.data.packages, { ...pkg, recordId: randomUUID(), slug: 'over-budget', samplePriceUsd: 6500, inclusions: ['Accommodation included'] }];
    const result = await h.send(request); expect(result.findings.map((f) => f.slug)).toEqual([pkg.slug, 'over-budget']);
    expect(statuses(result.findings[1]).budget).toBe('not_met');
    const ranked = evaluateFindings(result.findings, result.requirements!, h.data); expect(ranked[0].requirementEvaluation?.overallStatus).toBe('partially_satisfies');
  });
  it('does not turn an absent zero-placeholder price into a cheaper referenced package', async () => {
    const h = setup(); h.data.packages = [...h.data.packages, { ...pkg, recordId: randomUUID(), slug: 'no-price', samplePriceUsd: 0 }];
    const first = await h.send(request), cheaper = await h.send('Which package is cheaper?', first.conversationId);
    expect(cheaper.referenceResolution?.status).toBe('unresolved'); expect(cheaper.tasks).toEqual([]);
    expect(cheaper.summary).not.toContain('no-price');
  });
  it('preserves the comparison destination in an unpunctuated with-Pune follow-up', async () => {
    const h = setup(), first = await h.send(request), compared = await h.send('Compare it with Pune', first.conversationId);
    expect(compared.question).toBeNull(); expect(compared.comparison?.request.options.map((o) => o.value)).toEqual(['Mumbai', 'Pune']);
    expect(compared.requirements?.find((r) => r.type === 'accommodation')).toBeDefined();
  });
});
