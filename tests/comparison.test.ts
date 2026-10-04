import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { randomUUID } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('server-only', () => ({}));
import { harness, snapshot, tools, unavailable, userId } from './fixtures/comparison-harness';
import { normalizeComparison } from '@/lib/agents/comparison/normalize';
import { ComparisonResults } from '@/components/assistant/comparison-results';
import { assistantResponseSchema, comparisonSchema } from '@/lib/agents/schemas';
import type { ToolDependencies } from '@/lib/agents/tools';

describe('ComparisonAgent normalization, orchestration and sourced output', () => {
  it('saves a contextual comparison using cached search results without unsolicited model analysis', async () => {
    const generateStructured = vi.fn(async (request: { purpose: string }) => {
      if (request.purpose === 'observe') return { action: 'call_tool', tool: 'compare_providers', version: '1', input: JSON.stringify({ recordIds: [randomUUID()] }), question: null };
      throw new Error('Model unavailable in this regression');
    });
    const h = harness({ generateStructured: async request=>request.schema.parse(await generateStructured(request)) });
    const first = await h.send('I need knee replacement in Mumbai.');
    const comparison = await h.send('Compare it with Pune.', first.conversationId);
    expect(comparison.status).toBe('completed');
    expect(comparison.comparison?.sides.map(side=>side.option.value)).toEqual(['Mumbai', 'Pune']);
    const saved = await h.planningStore.load(first.conversationId, userId);
    expect(saved?.tasks.some(task=>task.comparison?.id === comparison.comparison?.id && task.status === 'completed')).toBe(true);
    expect(comparison.tasks.some(task=>task.tool === 'compare_providers')).toBe(false);
    expect(generateStructured.mock.calls.some(([request])=>request.purpose === 'observe')).toBe(false);
  });
  it.each([
    ['Compare knee replacement in Pune and Mumbai.', ['Pune', 'Mumbai'], ['hospitals', 'packages']],
    ['Compare knee replacement in Mumbai and Pune.', ['Mumbai', 'Pune'], ['hospitals', 'packages']],
    ['Compare Pune and Mumbai for knee replacement.', ['Pune', 'Mumbai'], ['hospitals', 'packages']],
    ['Knee replacement in Pune vs Mumbai.', ['Pune', 'Mumbai'], ['hospitals', 'packages']],
    ['Which has lower listed package cost for knee replacement, Pune or Mumbai?', ['Pune', 'Mumbai'], ['packages']],
    ['Compare hospitals for knee replacement in Pune and Mumbai.', ['Pune', 'Mumbai'], ['hospitals']],
    ['Compare knee replacement packages in Pune and Mumbai.', ['Pune', 'Mumbai'], ['packages']],
  ])('normalizes %s without a model', (content, options, targets) => {
    const { request, question } = normalizeComparison(content, snapshot);
    expect(question).toBeNull(); expect(request.subject).toMatchObject({ type: 'treatment', slug: 'knee-replacement', matchType: 'exact' });
    expect(request.options.map((option) => option.value)).toEqual(options); expect(request.targets).toEqual(targets);
  });
  it('executes ordered independent searches and preserves Pune none/Mumbai exact', async () => {
    const search = vi.fn(tools.search); const h = harness(unavailable, { ...tools, search });
    const result = await h.send('Compare knee replacement in Pune and Mumbai.');
    expect(result.agent).toBe('comparison'); expect(result.type).toBe('comparison'); expect(result.status).toBe('completed');
    expect(search.mock.calls.map(([, type, filters]) => [type, filters.city, filters.treatment])).toEqual([
      ['hospitals', 'Pune', 'knee-replacement'], ['packages', 'Pune', 'knee-replacement'], ['hospitals', 'Mumbai', 'knee-replacement'], ['packages', 'Mumbai', 'knee-replacement'],
    ]);
    expect(result.comparison?.sides.map((side) => side.groups.map((group) => group.matchType))).toEqual([['none', 'none'], ['exact', 'exact']]);
    expect(result.comparison?.sides[0].groups.flatMap((group) => group.findings)).toEqual([]);
    expect(result.comparison?.sides[1].groups[1].findings[0].facts.samplePriceUsd).toBe(5500);
    expect(result.summary).toContain('USD 5,500'); expect(result.summary).toMatch(/lower price.*cannot be determined/);
    expect(result.discovery).toBeUndefined(); expect(result.comparison?.subjectFinding?.title).toBe('Knee Replacement');
    expect(result.findings.every((finding) => finding.provenance.sourceRecordId && finding.provenance.retrievedAt && finding.provenance.sourceKind === 'synthetic')).toBe(true);
    expect(() => assistantResponseSchema.parse(result)).not.toThrow(); expect(h.outputs[0].comparison?.id).toBe(result.comparison?.id);
    expect(h.taskLinks).toHaveLength(5); expect(h.runLinks).toEqual([result.plan!.id]);
    const html = renderToStaticMarkup(createElement(ComparisonResults, { comparison: result.comparison! }));
    expect(html).toContain('<table>'); expect(html).toContain('Not provided in published information.'); expect(html).toContain('USD 5,500');
    expect(html).toContain('Demo data'); expect(html).toContain('Retrieved'); expect(html).toContain('/packages/knee-package');
    const invalid = structuredClone(result.comparison!); invalid.sides.reverse(); expect(comparisonSchema.safeParse(invalid).success).toBe(false);
  });
  it('preserves reversed order and avoids inferring a preference or user location', async () => {
    const result = await harness().send('I live in New Delhi. Compare knee replacement in Mumbai and Pune.');
    expect(result.comparison?.sides.map((side) => side.option.value)).toEqual(['Mumbai', 'Pune']);
    expect(result.comparison?.sides.map((side) => side.groups[0].matchType)).toEqual(['exact', 'none']);
    expect(result.summary).not.toMatch(/choose|winner|best city|better/);
  });
  it('supports country comparisons with the requested treatment', async () => {
    const extended = { ...snapshot, treatments: [...snapshot.treatments, { ...snapshot.treatments[0], recordId: randomUUID(), slug: 'cancer-treatment', name: 'Cancer Treatment', specialty: 'Oncology' }],
      countries: [...snapshot.countries, { ...snapshot.countries[0], slug: 'turkey', name: 'Turkey', aliases: ['Türkiye'] }] };
    const repository = { ...tools.repository, loadSnapshot: async () => extended };
    const { request, question } = normalizeComparison('Compare cancer treatment in India and Turkey.', extended);
    expect(question).toBeNull(); expect(request.subject?.slug).toBe('cancer-treatment');
    expect(request.options.map((option) => [option.type, option.value])).toEqual([['country', 'india'], ['country', 'turkey']]);
    const spy = vi.fn(tools.search); const result = await harness(unavailable, { ...tools, repository, search: spy }).send('Compare cancer treatment in India and Turkey.');
    expect(result.agent).toBe('comparison'); expect(spy.mock.calls.map(([, , filters]) => filters.country)).toEqual(['india', 'india', 'turkey', 'turkey']);
    expect(result.comparison?.sides.every((side) => side.groups.every((group) => group.matchType === 'none'))).toBe(true);
  });
  it.each(['Compare cardiologists in Pune and Mumbai.', 'Compare doctors for cardiology in Pune and Mumbai.'])('compares sourced doctors: %s', async (content) => {
    const result = await harness().send(content);
    expect(result.comparison?.request.subject).toMatchObject({ type: 'specialty', value: 'Cardiology' });
    expect(result.tasks.map((task) => task.tool)).toEqual(['search_doctors', 'search_doctors']);
    expect(result.comparison?.sides.map((side) => side.groups[0].matchType)).toEqual(['none', 'exact']);
    expect(result.comparison?.sides[1].groups[0].findings[0].facts.specialty).toBe('Cardiology');
  });
  it.each([
    ['Compare Pune and Mumbai.', /what would you like to compare/i],
    ['Compare knee replacement.', /which locations or countries/i],
    ['Compare knee replacement in Mumbai.', /second city or country/i],
    ['Compare knee replacement in Pune, Mumbai and Delhi.', /which two cities/i],
  ])('clarifies %s before any searches', async (content, question) => {
    const h = harness(); const result = await h.send(content);
    expect(result.status).toBe('awaiting_user_input'); expect(result.question).toMatch(question); expect(h.actions).toEqual([]); expect(result.comparison).toBeUndefined();
  });
  it('resolves a saved clarification without requiring the whole comparison again', async () => {
    const h = harness(); const first = await h.send('Compare Pune and Mumbai.');
    const next = await h.send('Knee replacement.', first.conversationId);
    expect(next.comparison?.request.subject?.slug).toBe('knee-replacement'); expect(next.plan?.id).toBe(first.plan?.id); expect(next.question).toBeNull();
    const one = await h.send('Compare knee replacement in Pune.');
    const two = await h.send('Mumbai.', one.conversationId); expect(two.comparison?.sides.map((side) => side.option.label)).toEqual(['Pune', 'Mumbai']);
  });
  it('reuses a saved comparison for a cheaper-package follow-up without duplicate searches', async () => {
    const h = harness(); const first = await h.send('Compare knee replacement in Pune and Mumbai.');
    const next = await h.send('Which has the cheaper package?', first.conversationId);
    expect(next.question).toBeNull(); expect(next.comparison?.request.options).toEqual(first.comparison?.request.options);
    expect(next.summary).toMatch(/no comparable package price/); expect(next.summary).not.toMatch(/Mumbai is cheaper/);
    expect(next.tasks).toHaveLength(0); expect(h.actions).toHaveLength(5); expect(next.plan?.id).toBe(first.plan?.id);
    const restored = await h.planningStore.load(first.conversationId, userId);
    expect(restored?.tasks.find((task) => task.comparison)?.comparison?.sides.map((side) => side.option.value)).toEqual(['Pune', 'Mumbai']);
  });
  it('adds comparison to an existing planning goal without replacing its destination or duplicating its plan', async () => {
    const h = harness(); const first = await h.send('I need knee replacement treatment in Mumbai.');
    const next = await h.send('Compare it with Pune.', first.conversationId);
    expect(next.agent).toBe('comparison'); expect(next.plan?.id).toBe(first.plan?.id); expect(h.planningStore.plans.size).toBe(1);
    expect(next.plan?.context.city).toBe('Mumbai'); expect(next.comparison?.request.options.map((option) => option.value)).toEqual(['Mumbai', 'Pune']);
    expect(next.plan?.tasks.some((task) => task.comparison && task.status === 'completed')).toBe(true);
    expect(next.tasks.map((task) => task.tool)).toEqual(['search_hospitals', 'search_packages', 'get_treatment']);
    expect(await h.planningStore.load(first.conversationId, 'another-user')).toBeUndefined();
  });
  it('filters packages by a supplied USD budget and invalidates only package inputs', async () => {
    const h = harness(); const first = await h.send('Compare knee replacement in Pune and Mumbai with a $6000 budget.');
    expect(first.comparison?.request.budget?.amount).toBe(6000); expect(first.comparison?.sides[1].groups[1].matchType).toBe('exact');
    const next = await h.send('My budget is around $4000.', first.conversationId);
    expect(next.tasks.map((task) => task.tool)).toEqual(['search_packages', 'search_packages']);
    expect(next.comparison?.sides[1].groups.map((group) => group.matchType)).toEqual(['exact', 'none']);
    expect(next.plan?.id).toBe(first.plan?.id);
  });
  it('does not convert INR budgets or treat them as USD', async () => {
    const result = await harness().send('Compare knee replacement in Pune and Mumbai with an INR 4000 budget.');
    expect(result.comparison?.request.budget?.currency).toBe('INR'); expect(result.comparison?.sides[1].groups[1].matchType).toBe('exact');
    expect(result.comparison?.limitations.join(' ')).toMatch(/not been converted or filtered/);
  });
  it('preserves a successful side when the other side fails, with bounded retries on the next request', async () => {
    const search = vi.fn(async (q, type, filters) => { if (filters.city === 'Pune') throw new Error('private database password'); return tools.search(q, type, filters); }) as unknown as ToolDependencies['search'];
    const h = harness(unavailable, { ...tools, search }); const first = await h.send('Compare knee replacement in Pune and Mumbai.');
    expect(first.status).toBe('failed'); expect(first.comparison?.sides[0].groups.every((group) => group.status === 'blocked')).toBe(true);
    expect(first.comparison?.sides[1].groups.every((group) => group.matchType === 'exact')).toBe(true);
    expect(first.summary).toContain('search incomplete'); expect(first.summary).not.toContain('password');
    expect(first.tasks).toHaveLength(5); expect(h.planningStore.locks.size).toBe(0);
    const next = await h.send('Compare knee replacement in Pune and Mumbai.', first.conversationId);
    expect(next.tasks).toHaveLength(2); expect(next.comparison?.sides[1].groups[1].matchType).toBe('exact');
  });
  it('preserves related group states without promoting them to exact', async () => {
    const dependencies: ToolDependencies = { ...tools, search: async (q, type, filters) => {
      const result = await tools.search(q, type, filters);
      if (type === 'hospitals') result.sections.hospitals = result.sections.hospitals.map((match) => ({ ...match, matchType: 'related', reason: 'Broader association only.' }));
      return result;
    } };
    const result = await harness(unavailable, dependencies).send('Compare hospitals for knee replacement in Pune and Mumbai.');
    expect(result.comparison?.sides[1].groups[0].matchType).toBe('related'); expect(result.summary).toContain('related catalog');
  });
  it('preserves both sides when they have exact records and reports listed prices without a clinical winner', async () => {
    const extended = { ...snapshot, hospitals: [...snapshot.hospitals, { ...snapshot.hospitals[0], recordId: randomUUID(), slug: 'pune-demo', name: 'Pune Demo Hospital', city: 'Pune' }],
      packages: [...snapshot.packages, { ...snapshot.packages[0], recordId: randomUUID(), slug: 'pune-package', name: 'Pune Demo Package', hospitalSlug: 'pune-demo', hospitalName: 'Pune Demo Hospital', samplePriceUsd: 5000 }] };
    const repository = { ...tools.repository, loadSnapshot: async () => extended };
    const { SearchService } = await import('@/lib/discovery/search-service'); const search = new SearchService(repository);
    const result = await harness(unavailable, { ...tools, repository, search: (q, type, filters) => search.search({ q, type, ...filters, sort: 'relevance' }) }).send('Compare knee replacement in Pune and Mumbai.');
    expect(result.comparison?.sides.every((side) => side.groups.every((group) => group.matchType === 'exact'))).toBe(true);
    expect(result.summary).toContain('USD 5,000'); expect(result.summary).toContain('USD 5,500'); expect(result.summary).not.toMatch(/wins|choose|better|best/);
  });
  it('keeps both empty sides explicit and does not count a shared treatment as a provider match', async () => {
    const result = await harness().send('Compare knee replacement in Pune and Delhi.');
    expect(result.comparison?.sides.every((side) => side.groups.every((group) => group.matchType === 'none'))).toBe(true);
    expect(result.comparison?.subjectFinding).toBeDefined(); expect(result.summary).toContain('no matching catalog hospitals');
  });
  it('does not compare providers of an unsupported procedure and labels only the related treatment topic', async () => {
    const h = harness(); const result = await h.send('Compare underwater brain surgery in Pune and Mumbai.');
    expect(result.comparison).toBeUndefined(); expect(h.actions).toEqual(['get_treatment']);
    expect(result.findings.map((finding) => [finding.title, finding.matchType])).toEqual([['Brain & Spine Surgery', 'related']]);
    expect(result.summary).toContain('No exact catalog treatment');
  });
  it('keeps DiscoveryAgent and TreatmentPlanningAgent regressions working', async () => {
    const h = harness(); const heart = await h.send('I need a heart doctor in Mumbai.');
    expect(heart.agent).toBe('discovery'); expect(heart.findings[0].facts.specialty).toBe('Cardiology'); expect(heart.discovery?.matchType).toBe('exact');
    const unsupported = await h.send('Find hospitals for underwater brain surgery in Mumbai.'); expect(unsupported.discovery?.matchType).toBe('none');
    const plan = await h.send('I need knee replacement treatment in Mumbai.'); expect(plan.agent).toBe('treatment_planning');
    const packages = await h.send('Show me packages.', plan.conversationId); expect(packages.resultGroups?.[0].matchType).toBe('exact');
    const multi = await h.send('Find knee replacement hospitals in Mumbai and show me relevant packages.');
    expect(multi.tasks.map((task) => task.tool)).toEqual(['search_hospitals', 'search_packages']); expect(multi.findings.every((finding) => finding.matchType === 'exact')).toBe(true);
  });
});
