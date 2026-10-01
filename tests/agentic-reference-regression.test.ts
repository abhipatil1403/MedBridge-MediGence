import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { harness, tools, snapshot, hospital, unavailable } from './fixtures/comparison-harness';

import { randomUUID } from 'node:crypto';
import { ReferenceDetector } from '@/lib/conversation/ReferenceDetector';
import { validatedConversationContext } from '@/lib/conversation/context';
import { ExecutionState } from '@/lib/agents/execution-state';
import { executeRegisteredTool } from '@/lib/agents/tool-execution';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ClarificationQuestion, RequestProgress } from '@/components/assistant/response-status';
import { HospitalMatchResults } from '@/components/assistant/hospital-match-results';
import { SearchService } from '@/lib/discovery/search-service';
import type { LLMProvider } from '@/lib/ai/contracts';
import { runAgent } from '@/lib/agents/runtime';

const searchRequest = "Find knee replacement hospitals in Mumbai under $6,000, check their packages, tell me what's missing, and compare them.";
describe('agentic reference production regression', () => {
  it('retains hospital scope across the exact invalid ordinal and correction', async () => {
    const h = harness(); const first = await h.send(searchRequest);
    const second = await h.send('Tell me more about the second one.', first.conversationId);
    expect(second.question).toContain('only showed 1 hospital');
    const corrected = await h.send('first one then', first.conversationId);
    expect(corrected.referenceResolution?.status).toBe('resolved');
    expect(corrected.referenceResolution?.reference?.entityType).toBe('hospital');
    expect(corrected.tasks.map(t => t.tool)).toEqual(['get_hospital']);
    const yes = await h.send('yes', first.conversationId);
    expect(yes.tasks).toEqual([]);
    expect(yes.question).toBeTruthy();
    expect(JSON.stringify(h.outputs)).not.toMatch(/facial plastic surgery/i);
  });
  it('repeats mixed-candidate clarification for yes instead of model planning', async () => {
    const provider = { generateStructured: vi.fn(async () => { throw new Error('Unrelated planner must not run'); }) };
    const h = harness(provider, tools); const first = await h.send('Find hospitals and packages for knee replacement.');
    const ambiguous = await h.send('Tell me more about the first one.', first.conversationId);
    expect(ambiguous.referenceResolution?.status).toBe('ambiguous');
    const before = provider.generateStructured.mock.calls.length;
    const answer = await h.send('yes', first.conversationId);
    expect(answer.referenceResolution?.status).toBe('ambiguous');
    expect(answer.question).toBeTruthy(); expect(answer.tasks).toEqual([]);
    expect(provider.generateStructured).toHaveBeenCalledTimes(before);
  });
});

function setup(two = false, outage = false) {
  const data = { ...structuredClone(snapshot), hospitals: [...snapshot.hospitals], packages: [...snapshot.packages] };
  data.hospitals[0] = { ...data.hospitals[0], recordId: 'cddb10ae-0000-4000-8000-000000000001', name: 'MedBridge Demo Centre · Mumbai' };
  data.packages[0] = { ...data.packages[0], recordId: '1ec68b66-0000-4000-8000-000000000001', name: 'Knee Replacement · sample care package', samplePriceUsd: 4700 };
  if (two) { data.hospitals.push({ ...data.hospitals[0], recordId: randomUUID(), slug: 'second-hospital', name: 'Second Hospital' });
    data.packages.push({ ...data.packages[0], recordId: randomUUID(), slug: 'second-package', name: 'Second Package' }); }
  const repository = { ...tools.repository, loadSnapshot: async () => data, listHospitals: async () => data.hospitals, listPackages: async () => data.packages };
  const service = new SearchService(repository);
  const search = vi.fn(async (...args: Parameters<typeof tools.search>) => {
    if (outage && args[1] === 'packages') throw new Error('Controlled service failure');
    return service.search({ q: args[0], type: args[1], ...args[2], sort: 'relevance' });
  });
  const provider = { generateStructured: vi.fn(unavailable.generateStructured) };
  return { ...harness(provider as LLMProvider, { ...tools, repository, search }), data, search, provider };
}

describe('persisted reference and clarification safeguards', () => {
  it.each(['yes', 'yeah', 'ok', 'sure', 'no', 'go ahead', 'do it'])('blocks nonselecting clarification reply %s', async reply => {
    const h = setup(true); const first = await h.send('Find hospitals and packages for knee replacement.');
    const clarification = await h.send('Tell me more about the first one.', first.conversationId);
    expect(clarification.pendingClarification?.candidates.map(c => c.entityType)).toEqual(['hospital', 'package']);
    const calls = h.provider.generateStructured.mock.calls.length, reads = h.search.mock.calls.length;
    const answer = await h.send(reply, first.conversationId);
    expect(answer.pendingClarification?.id).toBe(clarification.pendingClarification?.id);
    expect(answer.question).toBe(clarification.question); expect(answer.tasks).toEqual([]);
    expect(h.provider.generateStructured).toHaveBeenCalledTimes(calls); expect(h.search).toHaveBeenCalledTimes(reads);
  });
  it.each(['hospital', 'package', 'MedBridge Demo Centre · Mumbai', 'Knee Replacement · sample care package'])('selects actual candidate %s', async reply => {
    const h = setup(); const first = await h.send('Find hospitals and packages for knee replacement.');
    await h.send('Tell me more about the first one.', first.conversationId);
    const answer = await h.send(reply, first.conversationId);
    expect(answer.referenceResolution?.status).toBe('resolved'); expect(answer.tasks).toHaveLength(1);
    expect(answer.tasks[0].tool).toBe(/hospital|centre/i.test(reply) ? 'get_hospital' : 'get_package');
    expect(answer.pendingClarification).toBeUndefined();
  });
  it('retains pending IDs, original request, group order and context after serialized refresh', async () => {
    const h = setup(); const first = await h.send(searchRequest);
    const clarification = await h.send('Tell me more about the second one.', first.conversationId);
    expect(clarification.pendingClarification).toMatchObject({ conversationId: first.conversationId, runId: clarification.runId,
      originalRequest: 'Tell me more about the second one.', expectedAnswer: 'entity_selection', query: { entityType: 'hospital' } });
    h.planningStore.messages.set(first.conversationId, JSON.parse(JSON.stringify(h.planningStore.messages.get(first.conversationId))));
    h.planningStore.plans.set(first.conversationId, JSON.parse(JSON.stringify(h.planningStore.plans.get(first.conversationId))));
    const answer = await h.send('first one then', first.conversationId);
    expect(answer.findings[0].provenance.recordId).toBe(h.data.hospitals[0].recordId);
    await h.send('yes', first.conversationId);
    h.planningStore.messages.set(first.conversationId, h.planningStore.messages.get(first.conversationId)!.slice(-2));
    const packages = await h.send('Show me its packages.', first.conversationId);
    expect(packages.findings[0].provenance.recordId).toBe(h.data.packages[0].recordId);
  });
  it('restores clarification from the active plan with no message history', async () => {
    const h = setup(); const first = await h.send(searchRequest);
    await h.send('Tell me more about the second one.', first.conversationId);
    h.planningStore.messages.set(first.conversationId, []);
    const yes = await h.send('yes', first.conversationId); expect(yes.tasks).toEqual([]); expect(yes.pendingClarification).toBeDefined();
    expect((await h.send('first one then', first.conversationId)).findings[0].slug).toBe(hospital.slug);
  });
  it.each(['first hospital', 'second hospital', 'second package', 'Mumbai one'])('uses the displayed scope for %s', async phrase => {
    const h = setup(true); const first = await h.send('Find hospitals and packages for knee replacement.');
    const answer = await h.send(`Tell me more about the ${phrase}.`, first.conversationId);
    if (phrase === 'Mumbai one') expect(answer.referenceResolution?.status).toBe('ambiguous');
    else { expect(answer.referenceResolution?.status).toBe('resolved'); expect(answer.tasks[0].tool).toMatch(/^get_/); }
  });
  it('retains successful hospital references after a package tool failure', async () => {
    const h = setup(false, true); const first = await h.send(searchRequest);
    expect(first.activity?.state).toBe('partially_completed');
    const answer = await h.send('Tell me more about the first hospital.', first.conversationId);
    expect(answer.findings[0].slug).toBe(hospital.slug); expect(answer.tasks[0].tool).toBe('get_hospital');
  });
  it('an explicit unrelated new search supersedes clarification without inheriting its candidate', async () => {
    const h = setup(); const first = await h.send(searchRequest);
    await h.send('Tell me more about the second one.', first.conversationId);
    const answer = await h.send('Find heart doctors in Mumbai.', first.conversationId);
    expect(answer.tasks[0].tool).toBe('search_doctors'); expect(answer.referenceResolution).toBeUndefined();
  });
  it('validates unavailable candidate IDs again after clarification', async () => {
    const h = setup(); const first = await h.send(searchRequest);
    await h.send('Tell me more about the second one.', first.conversationId);
    h.data.hospitals[0] = { ...h.data.hospitals[0], recordId: randomUUID() };
    const answer = await h.send('first one then', first.conversationId);
    expect(answer.tasks).toEqual([]); expect(answer.question).toContain('no longer available');
  });
  it('provides structured findings, relationships, requirements and ordered references to runtime context', async () => {
    const h = setup(); const first = await h.send(searchRequest);
    const context = validatedConversationContext(first.conversationId, h.planningStore.messages.get(first.conversationId)!, first.plan);
    expect(context.findings.map(f => f.provenance.recordId)).toContain(h.data.hospitals[0].recordId);
    expect(context.findings.find(f => f.kind === 'packages')?.facts.hospitalSlug).toBe(hospital.slug);
    expect(context.references?.groups.flatMap(g => g.references).map(r => r.entityId)).toContain(h.data.packages[0].recordId);
    expect(context.requirements.map(r => r.type)).toContain('budget'); expect(context.activePlan?.id).toBe(first.plan?.id);
  });
  it('blocks direct runtime planning for a reference lacking deterministic resolution', async () => {
    const h = setup(); const first = await h.send(searchRequest); const calls = h.provider.generateStructured.mock.calls.length;
    const response = await runAgent({ content: 'Tell me about the first one.', conversationId: first.conversationId }, {
      userId: first.plan!.userId, store: h.store, provider: h.provider as LLMProvider, caseAccess: { readContext: async () => ({}), readDocumentMetadata: async () => [] },
      tools, conversation: validatedConversationContext(first.conversationId, h.planningStore.messages.get(first.conversationId)!, first.plan),
    });
    expect(response.tasks).toEqual([]); expect(response.question).toBeTruthy(); expect(h.provider.generateStructured).toHaveBeenCalledTimes(calls);
  });
  it.each(['search_hospitals', 'search_packages', 'search_treatments'])('hard blocks %s during clarification', async tool => {
    const state = new ExecutionState(randomUUID(), randomUUID(), randomUUID(), 'yes', 'Identify result', {} as never);
    await state.transition('planning'); const calls = vi.fn(tools.search);
    const observation = await executeRegisteredTool(state, { tool, input: { query: 'facial plastic surgery' } }, {
      agent: 'discovery', userId: state.ownerId, caseAccess: { readContext: async () => ({}), readDocumentMetadata: async () => [] },
      referenceBoundary: { status: 'ambiguous', allowedCalls: [] },
    }, { ...tools, search: calls });
    expect(observation.error?.code).toBe('REFERENCE_TOOL_BLOCKED'); expect(calls).not.toHaveBeenCalled();
  });
  it('blocks a valid but unrelated tool even after a reference is resolved', async () => {
    const state = new ExecutionState(randomUUID(), randomUUID(), randomUUID(), 'first one', 'Read hospital', {} as never);
    await state.transition('planning');
    const response = await executeRegisteredTool(state, { tool: 'get_hospital', input: { slug: 'another-hospital' } }, {
      agent: 'discovery', userId: state.ownerId, caseAccess: { readContext: async () => ({}), readDocumentMetadata: async () => [] },
      referenceBoundary: { status: 'resolved', allowedCalls: [{ tool: 'get_hospital', input: { slug: hospital.slug } }] },
    }, tools); expect(response.error?.code).toBe('REFERENCE_TOOL_BLOCKED');
  });
  it.each(['what about the other one?', 'what about this one?', 'the first package', 'the second hospital'])('classifies %s deterministically', content => {
    expect(ReferenceDetector.detect(content)).toBeDefined();
  });
});

describe('response presentation regressions', () => {
  it.each([null, undefined, 'null', 'undefined', '[object Object]', '', '  ', {}])('hides non-question %j', question => {
    expect(renderToStaticMarkup(createElement(ClarificationQuestion, { question }))).toBe('');
  });
  it('renders an actual clarification', () => {
    expect(renderToStaticMarkup(createElement(ClarificationQuestion, { question: 'Which hospital?' }))).toContain('Which hospital?');
  });
  it('hides empty request progress', () => {
    expect(renderToStaticMarkup(createElement(RequestProgress, {}))).toBe('');
  });
  it('renders only actual labelled operations with incomplete comparison visible', async () => {
    const response = await setup().send(searchRequest);
    const html = renderToStaticMarkup(createElement(RequestProgress, { request: response.compoundRequest }));
    expect(html).toContain('Hospital search'); expect(html).toContain('Package search'); expect(html).toContain('Comparison');
    expect(html).toContain('incomplete'); expect(html).not.toMatch(/<li[^>]*>\s*<\/li>|>null<|>undefined</);
  });
  it('distinguishes hospital criteria from linked package budget', async () => {
    const response = await setup().send(searchRequest);
    const html = renderToStaticMarkup(createElement(HospitalMatchResults, { matches: response.hospitalMatches! }));
    expect(html).not.toContain('All requested criteria documented'); expect(html).toContain('linked package');
    expect(html).toContain('hospital evidence'); expect(html).toContain('evaluated separately through a linked package');
  });
});
