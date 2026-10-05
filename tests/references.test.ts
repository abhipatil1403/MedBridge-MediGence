import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
vi.mock('server-only', () => ({}));
import { harness, hospital, pkg, snapshot, tools, unavailable } from './fixtures/comparison-harness';
import { SearchService } from '@/lib/discovery/search-service';
import { ReferenceDetector } from '@/lib/conversation/ReferenceDetector';
import { ReferenceResolver } from '@/lib/conversation/ReferenceResolver';
import { buildReferenceContext } from '@/lib/conversation/context';
import { assistantResponseSchema } from '@/lib/agents/schemas';
import type { CatalogSnapshot } from '@/types/catalog';
import type { LLMProvider } from '@/lib/ai/contracts';

function extendedHarness(options: { twoPackages?: boolean } = {}) {
  const bengaluru = { ...hospital, recordId: randomUUID(), slug: 'bengaluru-demo', name: 'Bengaluru Demo Hospital', city: 'Bengaluru' };
  const ankara = { ...hospital, recordId: randomUUID(), slug: 'ankara-demo', name: 'Ankara Demo Hospital', city: 'Ankara', country: 'turkey' };
  const secondPackage = { ...pkg, recordId: randomUUID(), slug: 'ankara-package', name: 'Turkey Demo Package', hospitalSlug: ankara.slug,
    hospitalName: ankara.name, country: 'turkey', samplePriceUsd: 6200, durationDays: 9 };
  const data: CatalogSnapshot = { ...snapshot, hospitals: [bengaluru, hospital, ankara], packages: options.twoPackages ? [pkg, secondPackage] : [pkg],
    countries: [...snapshot.countries, { ...snapshot.countries[0], recordId: randomUUID(), slug: 'turkey', name: 'Turkey', aliases: ['Türkiye'] }] };
  const repository = { ...tools.repository, loadSnapshot: async () => data, listHospitals: async () => data.hospitals, listPackages: async () => data.packages };
  const searchService = new SearchService(repository);
  const search = vi.fn(async (q, type, filters) => searchService.search({ q, type, ...filters, sort: 'relevance' }));
  const provider = { generateStructured: vi.fn(unavailable.generateStructured) };
  const h = harness(provider as LLMProvider, { ...tools, repository, search });
  return { ...h, data, provider, search };
}

describe('conversational reference detection and resolution', () => {
  it('retains the source list after cheapest, ordinal detail and service follow-ups for a pair comparison',async()=>{
    const h=extendedHarness({twoPackages:true});
    h.data.packages = h.data.packages.map((item,index)=>index===1 ? {...item,serviceDetails:{accommodation:{status:'conditional',information:'One guest-room night subject to eligibility.'}}} : item);
    const first=await h.send('Find knee replacement packages.');
    expect(first.findings.filter(f=>f.kind==='packages')).toHaveLength(2);
    const cheaper=await h.send('Which one is cheaper?',first.conversationId);
    expect(cheaper.referenceResolution?.reference?.slug).toBe(pkg.slug);
    const second=await h.send('Tell me more about the second one.',first.conversationId);
    expect(second.referenceResolution?.reference?.slug).toBe('ankara-package');
    const accommodation=await h.send('Does it include accommodation?',first.conversationId);
    expect(accommodation.referenceResolution?.reference?.slug).toBe('ankara-package');
    expect(accommodation.summary).toContain('Accommodation is conditional');
    expect(accommodation.summary).toContain('One guest-room night subject to eligibility.');
    const pair=await h.send('Compare it with the first one.',first.conversationId);
    expect(pair.type).toBe('comparison');expect(pair.findings.map(f=>f.slug)).toEqual(['ankara-package',pkg.slug]);
  });
  it('answers catalog information gaps without starting case intake after an empty package clarification', async () => {
    const h=extendedHarness();h.data.packages=[{...pkg,treatmentSlug:'health-checkup'}];
    const first=await h.send('Find knee replacement hospitals in Mumbai.');
    await h.send('Show me its packages.',first.conversationId);
    await h.send('Tell me more about the second package.',first.conversationId);
    const answer=await h.send('What information is missing?',first.conversationId);
    expect(answer.status).toBe('completed');
    expect(answer.findings[0].slug).toBe(hospital.slug);
    expect(answer.summary).toContain('No published packages or package prices');
    expect(answer.summary).not.toContain('No case information');
    expect(answer.patientCase).toBeUndefined();
  });
  it('distinguishes a hospital doctor relationship from hospital details', () => {
    expect(ReferenceDetector.detect('Show me doctors associated with this hospital.')).toMatchObject({entityType:'hospital',operation:'doctors'});
    expect(ReferenceDetector.detect('Show me its doctors.')).toMatchObject({entityType:'hospital',operation:'doctors'});
  });
  it('queries only hospital affiliations without inheriting unsupported procedure criteria', async () => {
    const h=extendedHarness();
    const first=await h.send('Find knee replacement hospitals in Mumbai.');
    const answer=await h.send('Show me doctors associated with this hospital.',first.conversationId);
    expect(answer.tasks.map(task=>task.tool)).toEqual(['search_doctors']);
    expect(answer.findings.length).toBe(2);
    expect(answer.findings.every(row=>row.kind==='doctors')).toBe(true);
    expect(answer.findings.some(row=>row.title==='Demo Cardiologist')).toBe(true);
    expect(h.search.mock.calls.at(-1)?.[2]).toMatchObject({hospital:hospital.slug});
    expect(h.search.mock.calls.at(-1)?.[2]?.treatment).toBeUndefined();
  });
  it.each(['the first one', 'the second one', 'the third one', 'the last one', 'this hospital', 'that hospital', 'this doctor', 'that package',
    'the Mumbai one', 'the Pune one', 'the Turkey one', 'the cheaper one', 'the more expensive one', 'the longer package', 'the shorter package',
    'the package you showed me', 'the hospital you mentioned', 'tell me more about that', 'tell me more about the second hospital', 'How much is that?', 'Does that hospital have a package?'])('detects %s', (text) => {
    expect(ReferenceDetector.detect(text.startsWith('tell') || text.startsWith('How') || text.startsWith('Does') ? text : `Tell me more about ${text}.`)).toBeDefined();
  });
  it.each(['Find cardiologists in Mumbai', 'Show me packages.', 'Compare it with Pune.', 'Which has the cheaper package?', 'My budget is around $4000.'])('preserves ordinary routing: %s', (text) => {
    expect(ReferenceDetector.detect(text)).toBeUndefined();
  });
  it.each(['This hospital.', 'That package.', 'Show me that doctor.', 'That one.'])('detects standalone demonstratives: %s', (text) => {
    expect(ReferenceDetector.detect(text)).toBeDefined();
  });
  it('answers an ambiguity using an actual candidate name', async () => {
    const h = extendedHarness({ twoPackages: true }); const first = await h.send('Find hospitals and packages for knee replacement.');
    const ambiguous = await h.send('Tell me more about the second one.', first.conversationId);
    expect(ambiguous.referenceResolution?.status).toBe('ambiguous');
    const candidate = ambiguous.referenceResolution!.candidates.find((item) => item.entityType === 'package')!;
    const answer = await h.send(candidate.displayName, first.conversationId);
    expect(answer.referenceResolution?.reference?.entityId).toBe(candidate.entityId); expect(answer.tasks[0].tool).toBe('get_package');
  });
  it('uses a saved hospital list after a package-only follow-up, even without older message history', async () => {
    const h = extendedHarness(); const first = await h.send('I need knee replacement treatment in Mumbai.');
    await h.send('Compare it with Pune.', first.conversationId);
    await h.send('Which has the cheaper package?', first.conversationId);
    h.planningStore.messages.set(first.conversationId, h.planningStore.messages.get(first.conversationId)!.slice(-2));
    const detail = await h.send('Tell me more about the hospital.', first.conversationId);
    expect(detail.findings[0].slug).toBe(hospital.slug); expect(detail.plan?.id).toBe(first.plan?.id);
  });
  it('resolves the second shown hospital and uses its get tool, with zero model or search calls', async () => {
    const h = extendedHarness(); const first = await h.send('Find knee replacement hospitals in India.');
    expect(first.findings.map((item) => item.facts.city)).toEqual(['Bengaluru', 'Mumbai']);
    expect(first.referenceContext?.groups[0].references.map((item) => item.position)).toEqual([1, 2]);
    const calls = h.provider.generateStructured.mock.calls.length, searches = h.search.mock.calls.length;
    const next = await h.send('Tell me more about the second one.', first.conversationId);
    expect(next.referenceResolution?.reference).toMatchObject({ slug: hospital.slug, entityId: hospital.recordId, entityType: 'hospital' });
    expect(next.tasks.map((task) => task.tool)).toEqual(['get_hospital']); expect(next.findings[0].slug).toBe(hospital.slug);
    expect(h.provider.generateStructured).toHaveBeenCalledTimes(calls); expect(h.search).toHaveBeenCalledTimes(searches);
    expect(next.understanding).not.toContain('scoliosis'); expect(assistantResponseSchema.safeParse(next).success).toBe(true);
    expect(h.outputs.at(-1)?.referenceContext?.groups[0].references[0].slug).toBe(hospital.slug);
  });
  it.each([['first hospital', 'bengaluru-demo'], ['second hospital', 'mumbai-demo'], ['last hospital', 'mumbai-demo'], ['Mumbai one', 'mumbai-demo']])('resolves %s in displayed results', async (phrase, slug) => {
    const h = extendedHarness(); const first = await h.send('Find knee replacement hospitals in India.');
    const next = await h.send(`Tell me more about the ${phrase}.`, first.conversationId); expect(next.findings[0].slug).toBe(slug);
  });
  it('resolves comparison ordinals across the hospital group and location references from saved comparison', async () => {
    const h = extendedHarness(); const first = await h.send('Compare knee replacement in India and Turkey.');
    const next = await h.send('Tell me more about the second hospital.', first.conversationId);
    expect(next.findings[0].slug).toBe('mumbai-demo'); expect(next.plan?.id).toBe(first.plan?.id);
    const turkey = await h.send('Tell me more about the Turkey one.', first.conversationId);
    expect(turkey.findings[0].slug).toBe('ankara-demo'); expect(turkey.tasks[0].tool).toBe('get_hospital');
  });
  it('clarifies a bare ordinal when different groups have plausible candidates', async () => {
    const h = extendedHarness({ twoPackages: true }); const first = await h.send('Find hospitals and packages for knee replacement.');
    expect(first.findings.length, first.summary).toBeGreaterThan(3);
    const next = await h.send('Tell me more about the second one.', first.conversationId);
    expect(next.referenceResolution?.status).toBe('ambiguous'); expect(next.tasks).toEqual([]);
    expect(next.question).toMatch(/hospital.+or.+package/i);
    const answer = await h.send('The hospital.', first.conversationId);
    expect(answer.referenceResolution?.reference?.entityType).toBe('hospital');
  });
  it('resolves the second package within its actual displayed group', async () => {
    const h = extendedHarness({ twoPackages: true }); const first = await h.send('Find knee replacement packages.');
    const next = await h.send('Tell me about the second package.', first.conversationId);
    expect(next.findings[0].slug).toBe(first.findings[1].slug); expect(next.tasks[0].tool).toBe('get_package');
  });
  it.each([['Which one is cheaper?', 'knee-package'], ['Tell me about the more expensive one.', 'ankara-package'],
    ['Tell me about the longer package.', 'ankara-package'], ['Tell me about the shorter package.', 'knee-package']])('resolves relative attributes from complete structured values: %s', async (content, slug) => {
    const h = extendedHarness({ twoPackages: true }); const first = await h.send('Compare knee replacement packages in India and Turkey.');
    const next = await h.send(content, first.conversationId); expect(next.referenceResolution?.status).toBe('resolved'); expect(next.findings[0].slug).toBe(slug);
    expect(next.summary).not.toMatch(/best|superior|wins|recommended/);
  });
  it('cannot declare a priced comparison side cheaper than an empty side', async () => {
    const h = extendedHarness(); const first = await h.send('Compare knee replacement in Pune and Mumbai.');
    const next = await h.send('Which package is cheaper?', first.conversationId);
    expect(next.referenceResolution?.status).toBe('unresolved'); expect(next.tasks).toEqual([]); expect(next.summary).toMatch(/comparable.+price is missing/);
    expect(next.summary).not.toContain('Mumbai is cheaper');
  });
  it('does not compare a package with missing price, mismatched currency, related match, or tied price', async () => {
    const h = extendedHarness({ twoPackages: true }); const first = await h.send('Find knee replacement packages.');
    for (const mutation of ['missing', 'currency', 'related', 'tie']) {
      const changed = structuredClone(first); const second = changed.findings[1];
      if (mutation === 'missing') delete second.facts.samplePriceUsd;
      if (mutation === 'currency') second.facts.currency = 'INR';
      if (mutation === 'related') second.matchType = 'related';
      if (mutation === 'tie') second.facts.samplePriceUsd = changed.findings[0].facts.samplePriceUsd;
      const result = ReferenceResolver.resolve({ conversationId: first.conversationId, userMessage: 'Which package is cheaper?', currentContext: buildReferenceContext(changed) });
      expect(result.status).toBe(mutation === 'tie' ? 'ambiguous' : 'unresolved'); expect(result.reference).toBeUndefined();
    }
  });
  it('asks for clarification with no context and never calls a guessed tool', async () => {
    const h = extendedHarness(); const next = await h.send('Tell me more about the second one.');
    expect(next.referenceResolution?.status).toBe('unresolved'); expect(next.tasks).toEqual([]); expect(next.question).toContain("don't have a recent list");
    expect(h.provider.generateStructured).not.toHaveBeenCalled(); expect(h.search).not.toHaveBeenCalled();
  });
  it('rejects an out-of-range ordinal without searching or falling back to another result', async () => {
    const h = extendedHarness(); const first = await h.send('Find knee replacement hospitals in India.');
    const next = await h.send('Tell me more about the fifth hospital.', first.conversationId);
    expect(next.referenceResolution?.status).toBe('unresolved'); expect(next.question).toContain('only showed 2'); expect(next.tasks).toEqual([]);
  });
  it('handles a bare second comparison result safely when hospital and package are both plausible', async () => {
    const h = extendedHarness(); const first = await h.send('Compare knee replacement in Pune and Mumbai.');
    const next = await h.send('Tell me more about the second one.', first.conversationId);
    expect(next.referenceResolution?.reference?.slug).toBe('knee-package'); expect(next.tasks[0].tool).toBe('get_package');
  });
  it('continues a care plan through hospital, associated package and package detail without changing its goal', async () => {
    const h = extendedHarness(); const first = await h.send('I need knee replacement treatment in Mumbai.');
    const detail = await h.send('Tell me more about the hospital.', first.conversationId);
    expect(detail.findings[0].slug).toBe(hospital.slug); expect(detail.plan?.id).toBe(first.plan?.id);
    const packages = await h.send('Show me its package.', first.conversationId);
    expect(packages.tasks[0].tool).toBe('search_packages'); expect(h.search.mock.calls.at(-1)?.[2]).toMatchObject({ hospital: hospital.slug, treatment: 'knee-replacement' });
    expect(packages.findings.map((item) => item.slug)).toEqual([pkg.slug]);
    const nested = await h.send('Tell me more about that package.', first.conversationId);
    expect(nested.tasks[0].tool).toBe('get_package'); expect(nested.findings[0].slug).toBe(pkg.slug);
    const price = await h.send('How much is that?', first.conversationId); expect(price.summary).toContain('USD 5,500');
    expect(h.planningStore.plans.size).toBe(1); expect(price.plan?.context).toEqual(first.plan?.context);
  });
  it('restores context from serialized server messages, ignores forged reference metadata, and keeps conversation scope', async () => {
    const h = extendedHarness(); const first = await h.send('Find knee replacement hospitals in India.');
    const messages = JSON.parse(JSON.stringify(h.planningStore.messages.get(first.conversationId)));
    messages[1].metadata.response.referenceContext.groups[0].references[1].slug = 'scoliosis-surgery';
    h.planningStore.messages.set(first.conversationId, messages);
    const next = await h.send('Tell me more about the second one.', first.conversationId); expect(next.findings[0].slug).toBe(hospital.slug);
    const empty = await h.send('Tell me more about the second one.'); expect(empty.tasks).toEqual([]);
    const resolution = ReferenceResolver.resolve({ conversationId: randomUUID(), userMessage: 'the second one', currentContext: first.referenceContext });
    expect(resolution.status).toBe('unresolved');
  });
  it('keeps an empty recent search from resolving an ordinal against older results', async () => {
    const h = extendedHarness(); const first = await h.send('Find knee replacement hospitals in India.');
    await h.send('Find knee replacement hospitals in Pune.', first.conversationId);
    const next = await h.send('Tell me more about the second hospital.', first.conversationId); expect(next.tasks).toEqual([]); expect(next.referenceResolution?.status).toBe('unresolved');
  });
  it('does not use an unavailable or ID/slug-mismatched record', async () => {
    const h = extendedHarness(); const first = await h.send('Find knee replacement hospitals in India.');
    h.data.hospitals = h.data.hospitals.map((item, index) => index === 1 ? { ...item, recordId: randomUUID() } : item);
    const next = await h.send('Tell me more about the second hospital.', first.conversationId);
    expect(next.tasks).toEqual([]); expect(next.summary).toContain('no longer available');
  });
  it('preserves related match labels during detail lookup', async () => {
    const h = extendedHarness(); const first = await h.send('Find hospitals for underwater brain surgery in Mumbai.');
    const next = await h.send('Tell me more about the treatment you showed me.', first.conversationId);
    expect(next.findings[0].matchType).toBe('related'); expect(next.tasks[0].tool).toBe('get_treatment');
  });
  it('preserves explicit discovery, unsupported treatment, comparison and package planning regressions', async () => {
    const h = extendedHarness(); expect((await h.send('I need a heart doctor in Mumbai.')).agent).toBe('discovery');
    expect((await h.send('Find hospitals for underwater brain surgery in Mumbai.')).discovery?.matchType).toBe('none');
    expect((await h.send('Compare knee replacement in India and Turkey.')).agent).toBe('comparison');
    const first = await h.send('I need knee replacement treatment in Mumbai.'); const next = await h.send('Show me packages.', first.conversationId);
    expect(next.agent).toBe('treatment_planning'); expect(next.resultGroups?.[0].target).toBe('packages');
  });
});
