import { describe, expect, it, vi } from 'vitest';
import { zodTextFormat } from 'openai/helpers/zod';
vi.mock('server-only', () => ({}));

import { SearchService } from '@/lib/discovery/search-service';
import { QueryNormalizer } from '@/lib/discovery/query-normalizer';
import { getComparison } from '@/lib/catalog/comparison-service';
import { executeTool, toolRegistry, toolSchemas, type CaseAccess, type ToolDependencies } from '@/lib/agents/tools';
import { runAgent, AGENT_LIMITS } from '@/lib/agents/runtime';
import { agents } from '@/lib/agents/registry';
import { AgentError } from '@/lib/agents/errors';
import type { AgentStore } from '@/lib/agents/persistence';
import type { LLMProvider } from '@/lib/ai/contracts';
import type { AgentPlan, AgentResponse, AgentTaskView, ToolName } from '@/lib/agents/schemas';
import { planSchema, synthesisSchema } from '@/lib/agents/schemas';
import type { CatalogRepository, Country, Doctor, Hospital, Package, PriceEstimate, Service, Treatment } from '@/types/catalog';

const id = (last: number) => `00000000-0000-4000-8000-${String(last).padStart(12, '0')}`;
const base = (last: number, slug: string, name: string) => ({ recordId: id(last), sourceRecordId: id(last + 100), slug, name,
  description: `${name} demo catalog record`, aliases: [], demo: true, sourceKind: 'synthetic' as const });
const treatment: Treatment = { ...base(1, 'knee-replacement', 'Knee replacement'), specialty: 'Orthopedics', category: 'Surgery', overview: '', procedure: '',
  indications: '', diagnostics: '', recovery: '', typicalStayDays: 8, sampleBaseCostUsd: 5000, countries: ['india', 'turkey'], faqs: [] };
const brainTreatment: Treatment = { ...treatment, ...base(11, 'brain-and-spine-surgery', 'Brain & Spine Surgery'),
  aliases: ['brain surgery', 'spine surgery'], specialty: 'Neurology', countries: ['turkey'] };
const spinalTreatment: Treatment = { ...treatment, ...base(12, 'spinal-fusion', 'Spinal Fusion'),
  aliases: ['spine fusion'], specialty: 'Neurology', countries: ['india'] };
const india: Country = { ...base(2, 'india', 'India'), code: 'IN', travelNote: 'Travel planning varies by patient.' };
const turkey: Country = { ...base(3, 'turkey', 'Turkey'), code: 'TR', travelNote: 'Check current travel requirements.' };
const mumbai: Hospital = { ...base(4, 'mumbai-demo', 'Mumbai Demo Hospital'), city: 'Mumbai', country: 'india', specialties: ['Orthopedics'],
  treatmentSlugs: ['knee-replacement', 'spinal-fusion'], sampleBedCount: 20, sampleAccreditation: 'No credential listed', verification: 'Demo — unverified', infrastructure: [] };
const istanbul: Hospital = { ...base(5, 'istanbul-demo', 'Istanbul Demo Hospital'), city: 'Istanbul', country: 'turkey', specialties: ['Orthopedics'],
  treatmentSlugs: ['knee-replacement'], sampleBedCount: 20, sampleAccreditation: 'No credential listed', verification: 'Demo — unverified', infrastructure: [] };
const doctor: Doctor = { ...base(6, 'cardiologist-demo', 'Demo Cardiologist'), specialty: 'Cardiology', hospitalSlug: 'mumbai-demo',
  hospitalName: 'Mumbai Demo Hospital', city: 'Mumbai', country: 'india', sampleExperienceYears: 10, languages: ['English'],
  consultationMode: 'both', treatmentSlugs: [], verification: 'Demo — unverified', qualifications: [] };
const pkg: Package = { ...base(7, 'knee-india-demo', 'Knee India Demo Package'), treatmentSlug: 'knee-replacement', hospitalSlug: 'mumbai-demo',
  hospitalName: 'Mumbai Demo Hospital', country: 'india', durationDays: 9, samplePriceUsd: 6500, inclusions: [], exclusions: [], benefits: [] };
const service: Service = { ...base(8, 'travel', 'Travel planning'), href: '/medical-travel', category: 'plan', steps: [] };
const estimates: PriceEstimate[] = [
  { recordId: id(9), sourceRecordId: id(109), treatmentSlug: 'knee-replacement', countrySlug: 'india', estimatedMinUsd: 5000, estimatedMaxUsd: 8000, sourceKind: 'synthetic' },
  { recordId: id(10), sourceRecordId: id(110), treatmentSlug: 'knee-replacement', countrySlug: 'turkey', estimatedMinUsd: 6000, estimatedMaxUsd: 9000, sourceKind: 'synthetic' },
];
const repository: CatalogRepository = {
  listTreatments: async () => [treatment, brainTreatment, spinalTreatment], listHospitals: async () => [mumbai, istanbul], listDoctors: async () => [doctor],
  listPackages: async () => [pkg], listCountries: async () => [india, turkey], listServices: async () => [service],
  listPriceEstimates: async () => estimates,
  findCandidateSlugs: async () => ({ treatments: new Set([treatment.slug, brainTreatment.slug, spinalTreatment.slug]), hospitals: new Set([mumbai.slug, istanbul.slug]),
    doctors: new Set([doctor.slug]), packages: new Set([pkg.slug]), countries: new Set([india.slug, turkey.slug]), services: new Set([service.slug]) }),
};
const searchService = new SearchService(repository);
const dependencies: ToolDependencies = {
  repository,
  search: (query, type, filters) => searchService.search({ q: query, type, ...filters, sort: 'relevance' }),
  compare: (treatmentSlug, first, second) => getComparison(treatmentSlug, first, second, repository),
};

class MemoryStore implements AgentStore {
  tasks = new Map<string, AgentTaskView['status']>();
  actions: Array<{ tool: ToolName; status: string }> = [];
  messages: string[] = [];
  output?: AgentResponse;
  runStatus?: string;
  diagnostics?: Record<string, string | boolean | null>;
  async createConversation() { return id(1000); }
  async assertConversation(conversationId: string) { if (conversationId !== id(1000)) throw new Error('denied'); }
  async addMessage(_conversationId: string, _role: 'user' | 'assistant', content: string) { this.messages.push(content); }
  async startRun() { return id(1001); }
  async createTask() { const taskId = id(1100 + this.tasks.size); this.tasks.set(taskId, 'pending'); return taskId; }
  async updateTask(taskId: string, status: AgentTaskView['status']) { this.tasks.set(taskId, status); }
  async recordAction(_runId: string, _taskId: string, tool: ToolName, status: 'completed' | 'failed' | 'proposed') { this.actions.push({ tool, status }); return status === 'proposed' ? id(1200) : undefined; }
  async saveOutput(_runId: string, response: AgentResponse) { this.output = response; }
  async finishRun(_runId: string, status: AgentResponse['status'], _errorCode?: string, diagnostics?: Record<string, string | boolean | null>) {
    this.runStatus = status; this.diagnostics = diagnostics;
  }
}
class MockProvider implements LLMProvider {
  calls: string[] = [];
  constructor(private readonly plan: AgentPlan | object) {}
  async generateStructured<T>(request: { purpose: string }): Promise<T> {
    this.calls.push(request.purpose);
    const valid = planSchema.safeParse(this.plan);
    const followUp = request.purpose === 'plan' && this.calls.filter((item) => item === 'plan').length > 1 && valid.success
      && valid.data.steps.every((item) => agents[valid.data.agent].allowedTools.includes(item.tool));
    return (request.purpose === 'plan' ? followUp ? { ...this.plan, steps: [] } : this.plan
      : { summary: 'These catalog matches follow the criteria provided.', nextSteps: ['Review the sourced options.'], question: null }) as T;
  }
}
const caseAccess: CaseAccess = { readContext: async (caseId) => ({ caseId, title: 'Knee planning' }), readDocumentMetadata: async () => [] };
const deniedCaseAccess: CaseAccess = { readContext: async () => { throw new Error('denied'); }, readDocumentMetadata: async () => { throw new Error('denied'); } };
const step = (tool: ToolName, input: Record<string, string>, objective = tool) => ({ tool, input: JSON.stringify(input), objective });
const plan = (agent: AgentPlan['agent'], steps: AgentPlan['steps'], missingInformation: string | null = null): AgentPlan => ({ agent, steps, understanding: 'The request is to explore care options.', missingInformation });
const run = (content: string, selected: AgentPlan | object, extras: { caseId?: string; access?: CaseAccess; tools?: ToolDependencies } = {}) => {
  const store = new MemoryStore(); const provider = new MockProvider(selected);
  return { store, provider, promise: runAgent({ content, caseId: extras.caseId }, {
    userId: id(2000), store, provider, caseAccess: extras.access ?? caseAccess, tools: extras.tools ?? dependencies,
  }) };
};

describe('controlled agent tools', () => {
  it('registers all required tools with schemas', () => {
    expect(Object.keys(toolSchemas)).toHaveLength(27);
    expect(agents.discovery.allowedTools).not.toContain('create_case');
    expect(agents.comparison.allowedTools).toContain('compare_treatment_options');
    expect(toolRegistry.get_case_context.authorization).toBe('case_consent');
    expect(toolRegistry.create_case.sideEffect).toBe('propose');
    expect(toolRegistry.search_doctors.outputSchema).toBeDefined();
  });
  it('produces a strict OpenAI planning schema', () => {
    expect(() => zodTextFormat(planSchema, 'plan')).not.toThrow();
    expect(() => zodTextFormat(synthesisSchema, 'synthesis')).not.toThrow();
  });
  it('rejects malformed tool input and cross-agent calls', async () => {
    const context = { agent: 'discovery' as const, userId: id(2000), caseAccess };
    await expect(executeTool('search_doctors', { query: '' }, context, dependencies)).rejects.toMatchObject({ code: 'TOOL_INPUT_INVALID' });
    await expect(executeTool('create_case', { title: 'Test' }, context, dependencies)).rejects.toMatchObject({ code: 'TOOL_DENIED' });
  });
  it('returns an honest empty result for a location absent from the catalog', async () => {
    const result = await executeTool('search_hospitals', { query: 'knee replacement', city: 'Atlantis' },
      { agent: 'discovery', userId: id(2000), caseAccess }, dependencies);
    expect(result.findings).toEqual([]);
    expect(result.note).toMatch(/No matching catalog records/);
  });
  it('isolates case tools to the selected authorized case', async () => {
    const context = { agent: 'treatment_planning' as const, userId: id(2000), caseId: id(3000), caseAccess };
    await expect(executeTool('get_case_context', { caseId: id(3001) }, context, dependencies)).rejects.toMatchObject({ code: 'CASE_SCOPE_DENIED' });
    const result = await executeTool('get_case_context', { caseId: id(3000) }, context, dependencies);
    expect(result.caseContext?.title).toBe('Knee planning');
  });
});

describe('agent integration scenarios', () => {
  it('discovers a cardiologist in India with catalog provenance', async () => {
    const operation = run('I need a cardiologist in India.', plan('discovery', [step('search_doctors', { query: 'cardiologist in India' })]));
    const result = await operation.promise;
    expect(result.agent).toBe('discovery');
    expect(result.findings[0].title).toBe('Demo Cardiologist');
    expect(result.findings[0].provenance).toMatchObject({ table: 'doctors', recordId: doctor.recordId, sourceKind: 'synthetic' });
    expect(operation.store.actions).toEqual([{ tool: 'search_doctors', status: 'completed' }]);
    expect(operation.store.runStatus).toBe('completed');
  });
  it('executes treatment planning across treatment, hospital and package tools', async () => {
    const operation = run('I need knee replacement in India.', plan('treatment_planning', [
      step('search_treatments', { query: 'knee replacement India' }),
      step('search_hospitals', { query: 'knee replacement India' }),
      step('search_packages', { query: 'knee replacement India' }),
    ]));
    const result = await operation.promise;
    expect(result.tasks.map((task) => task.status)).toEqual(['completed', 'completed', 'completed']);
    expect(result.findings.map((item) => item.kind)).toEqual(expect.arrayContaining(['treatments', 'hospitals', 'packages']));
  });
  it('compares two countries and preserves estimate provenance', async () => {
    const operation = run('Compare knee replacement in India and Turkey.', plan('comparison', [
      step('compare_treatment_options', { treatment: 'knee-replacement', firstCountry: 'india', secondCountry: 'turkey' }),
    ]));
    const result = await operation.promise;
    expect(result.findings.filter((item) => item.kind === 'price_estimates')).toHaveLength(2);
    expect(result.findings.find((item) => item.provenance.recordId === id(9))?.facts.estimatedMinUsd).toBe(5000);
  });
  it('uses authorized case context for a Mumbai hospital search', async () => {
    const operation = run("Find a hospital for my father's knee surgery in Mumbai.", plan('hospital_matching', [
      step('get_case_context', { caseId: id(3000) }),
      step('search_hospitals', { query: 'knee replacement Mumbai', city: 'Mumbai' }),
    ]), { caseId: id(3000) });
    const result = await operation.promise;
    expect(result.findings.map((item) => item.title)).toContain('Mumbai Demo Hospital');
    expect(result.findings.map((item) => item.title)).not.toContain('Istanbul Demo Hospital');
  });
  it('stops external medical record sharing at an approval boundary', async () => {
    const operation = run('Send my medical reports to Hospital X.', plan('discovery', []));
    const result = await operation.promise;
    expect(result.status).toBe('awaiting_approval');
    expect(operation.provider.calls).toEqual([]);
    expect(operation.store.actions).toEqual([{ tool: 'request_external_action', status: 'proposed' }]);
    expect(result.summary).toMatch(/No external action was taken/);
  });
  it('proposes an exact case change and does not write before approval', async () => {
    const operation = run('Create a case called Knee planning.', plan('treatment_planning', [step('create_case', { title: 'Knee planning' })]));
    const result = await operation.promise;
    expect(result.status).toBe('awaiting_approval');
    expect(result.approvalProposal).toEqual({ action: 'create_case', detail: 'Case title: Knee planning' });
    expect(operation.store.actions).toEqual([{ tool: 'create_case', status: 'proposed' }]);
  });
  it('can plan a second tool pass from actual returned catalog slugs', async () => {
    const first = plan('hospital_matching', [step('search_hospitals', { query: 'knee replacement Mumbai' })]);
    const second = plan('hospital_matching', [step('get_hospital', { slug: 'mumbai-demo' })]);
    let planningCalls = 0;
    const provider: LLMProvider = { generateStructured: (async (request: { purpose: string }) => {
      if (request.purpose === 'synthesis') return { summary: 'A matching catalog option is available.', nextSteps: [], question: null };
      planningCalls++;
      return planningCalls === 1 ? first : second;
    }) as LLMProvider['generateStructured'] };
    const store = new MemoryStore();
    const result = await runAgent({ content: 'Find a hospital for knee replacement in Mumbai.', caseId: id(3000) }, { userId: id(2000), store, provider, caseAccess, tools: dependencies });
    expect(result.tasks.map((task) => task.tool)).toEqual(['search_hospitals', 'get_hospital']);
    expect(result.tasks.every((task) => task.status === 'completed')).toBe(true);
  });
  it('keeps the first agent permission boundary when a later model turn suggests another agent', async () => {
    const first = plan('discovery', [step('search_hospitals', { query: 'knee replacement Mumbai' })]);
    const second = plan('hospital_matching', [step('get_hospital', { slug: 'mumbai-demo' })]);
    let planningCalls = 0;
    const provider: LLMProvider = { generateStructured: (async (request: { purpose: string }) => {
      if (request.purpose === 'synthesis') return { summary: 'A matching catalog option is available.', nextSteps: [], question: null };
      planningCalls++;
      return planningCalls === 1 ? first : second;
    }) as LLMProvider['generateStructured'] };
    const store = new MemoryStore();
    const result = await runAgent({ content: 'Find a hospital for knee replacement in Mumbai.', caseId: id(3000) }, { userId: id(2000), store, provider, caseAccess, tools: dependencies });
    expect(result.status).toBe('completed');
    expect(result.agent).toBe('discovery');
    expect(result.tasks.map((task) => task.tool)).toEqual(['search_hospitals', 'get_hospital']);
  });
  it('awaits one missing answer rather than failing', async () => {
    const operation = run('Find care options for my father.', plan('treatment_planning', [], 'Which country would you prefer?'));
    const result = await operation.promise;
    expect(result.status).toBe('awaiting_user_input');
    expect(result.question).toBe('Which country would you prefer?');
  });
  it('returns found catalog matches without requiring an optional refinement answer', async () => {
    const operation = run('Find knee replacement hospitals in Mumbai.', plan('discovery', [
      step('search_hospitals', { query: 'knee replacement Mumbai', city: 'Mumbai' }),
      step('request_user_information', { question: 'Would you like to refine by budget?' }),
    ], 'Would you like to refine by budget?'));
    const result = await operation.promise;
    expect(result.status).toBe('completed');
    expect(result.question).toBeNull();
    expect(result.findings.some((item) => item.kind === 'hospitals')).toBe(true);
    expect(operation.store.actions).toEqual([{ tool: 'search_hospitals', status: 'completed' }]);
  });
  it('blocks unauthorized case access before calling a model', async () => {
    const operation = run('Plan knee care in my case.', plan('treatment_planning', []), { caseId: id(3000), access: deniedCaseAccess });
    await expect(operation.promise).rejects.toThrow('denied');
    expect(operation.provider.calls).toEqual([]);
  });
  it('fails a tool safely and records the failure', async () => {
    const failingTools: ToolDependencies = { ...dependencies, search: async () => { throw new Error('internal database failure'); } };
    const operation = run('Find doctors in India.', plan('discovery', [step('search_doctors', { query: 'cardiologist India' })]), { tools: failingTools });
    const result = await operation.promise;
    expect(result.status).toBe('failed');
    expect(result.summary).not.toContain('internal database failure');
    expect(operation.store.actions).toEqual([{ tool: 'search_doctors', status: 'failed' }]);
    expect(operation.store.runStatus).toBe('failed');
  });
  it('recovers from invalid model plans with a validated catalog search', async () => {
    const operation = run('Find doctors in India.', { agent: 'discovery', steps: [{ tool: 'create_case', input: '{}', objective: 'oops' }], understanding: 'x', missingInformation: null });
    const result = await operation.promise;
    expect(result.status).toBe('completed');
    expect(operation.provider.calls).toHaveLength(AGENT_LIMITS.maxPlanningAttempts);
    expect(operation.store.actions).toEqual([{ tool: 'search_doctors', status: 'completed' }]);
    expect(result.summary).not.toMatch(/invalid action|schema error/i);
    expect(operation.store.diagnostics).toMatchObject({ modelPlanError: 'PLAN_TOOL_DENIED', recoveryAttempted: true, recoveryResult: 'completed' });
  });
  it('rejects plans beyond the tool call limit', async () => {
    const operation = run('Find options.', plan('discovery', Array.from({ length: AGENT_LIMITS.maxToolCalls + 1 }, () => step('search_doctors', { query: 'doctors India' }))));
    const result = await operation.promise;
    expect(result.status).toBe('failed');
    expect(operation.store.actions).toHaveLength(0);
  });
  it('answers urgent clinical requests without diagnosis or model execution', async () => {
    const operation = run('My chest hurts, what disease do I have?', plan('discovery', []));
    const result = await operation.promise;
    expect(result.summary).toMatch(/emergency care/);
    expect(operation.provider.calls).toEqual([]);
  });
  it('rejects unsafe synthesis while preserving a failed run', async () => {
    const selected = plan('discovery', [step('search_doctors', { query: 'cardiologist India' })]);
    const provider: LLMProvider = { generateStructured: (async (request: { purpose: string }) => request.purpose === 'plan'
      ? selected : { summary: 'This is the best hospital with a guaranteed outcome.', nextSteps: [], question: null }) as LLMProvider['generateStructured'] };
    const store = new MemoryStore();
    const result = await runAgent({ content: 'Find some care options.' }, { userId: id(2000), store, provider, caseAccess, tools: dependencies });
    expect(result.status).toBe('failed');
    expect(result.summary).not.toContain('best hospital');
    expect(store.runStatus).toBe('failed');
  });
});

describe('discovery reliability', () => {
  const catalog = { treatments: [treatment, brainTreatment, spinalTreatment], hospitals: [mumbai, istanbul],
    doctors: [doctor], countries: [india, turkey], services: [service] };

  it.each([
    ['I need a heart doctor in Mumbai', 'Cardiology', 'Mumbai'],
    ['Find cardiologists in Mumbai', 'Cardiology', 'Mumbai'],
    ['Find cancer doctors in Mumbai', 'Oncology', 'Mumbai'],
    ['Find hospitals in Pune', undefined, 'Pune'],
  ])('normalizes %s', (query, specialty, city) => {
    const normalized = QueryNormalizer.normalize(query, catalog);
    expect(normalized.entities.specialty).toBe(specialty);
    expect(normalized.entities.city).toBe(city);
  });

  it.each(['Find hospitals for underwater brain surgery in Mumbai', 'Underwater brain surgery in Mumbai'])
  ('does not promote a broad brain-surgery alias into an underwater procedure match: %s', async (query) => {
    const normalized = QueryNormalizer.normalize(query, catalog);
    expect(normalized.entities.procedure).toBeUndefined();
    expect(normalized.entities.relatedProcedure).toBe('brain-and-spine-surgery');
    expect(normalized.entities.procedureMatchType).toBe('related');
    const result = await searchService.search({ q: normalized.query, type: 'all', sort: 'relevance' });
    expect(result.total).toBe(0);
    const store = new MemoryStore();
    const provider: LLMProvider = { generateStructured: (async () => ({ agent: 'discovery', understanding: 'x', missingInformation: null,
      steps: [{ tool: 'search_hospitals', input: '{bad json', objective: 'Invalid' }] })) as LLMProvider['generateStructured'] };
    const response = await runAgent({ content: normalized.query }, { userId: id(2000), store, provider, caseAccess, tools: dependencies });
    expect(response.status).toBe('completed');
    expect(response.findings.map((item) => item.title)).toEqual(['Brain & Spine Surgery']);
    expect(response.findings[0].matchType).toBe('related');
    expect(response.findings.every((item) => item.kind !== 'hospitals')).toBe(true);
    expect(response.discovery?.matchType).toBe('none');
    expect(response.summary).toMatch(/couldn't find an exact catalog match/i);
    expect(response.summary).not.toMatch(/spinal fusion|invalid action/i);
    expect(store.actions).toEqual([{ tool: 'search_treatments', status: 'completed' }, { tool: 'get_treatment', status: 'completed' }]);
    expect(store.diagnostics).toMatchObject({ modelPlanError: 'PLAN_INPUT_INVALID', recoveryResult: 'completed' });
  });

  it.each(['Find me a hospital for surgery', 'Find a hospital'])('asks for the missing procedure in %s', async (query) => {
    const operation = run(query, plan('discovery', []));
    const response = await operation.promise;
    expect(response.status).toBe('awaiting_user_input');
    expect(response.question).toMatch(/surgery or procedure/i);
    expect(operation.provider.calls).toEqual([]);
  });

  it('searches cardiology doctors in Mumbai without a locality question', async () => {
    const operation = run('I need a heart doctor in Mumbai', plan('discovery', [
      step('request_user_information', { question: 'Which Mumbai locality?' }),
    ], 'Which Mumbai locality?'));
    const response = await operation.promise;
    expect(response.status).toBe('completed');
    expect(response.question).toBeNull();
    expect(response.findings.map((item) => item.title)).toEqual(['Demo Cardiologist']);
    expect(response.findings[0].matchType).toBe('exact');
    expect(operation.store.actions).toEqual([{ tool: 'search_doctors', status: 'completed' }]);
  });

  it('filters knee hospitals and packages by treatment and Mumbai', async () => {
    const single = await run('Find knee replacement hospitals in Mumbai', plan('discovery', [])).promise;
    expect(single.findings.map((item) => item.title)).toEqual(['Mumbai Demo Hospital']);
    expect(single.findings[0].matchReason).toMatch(/explicitly linked/i);
    const multiOperation = run('Find knee replacement hospitals in Mumbai and show me relevant packages', plan('discovery', []));
    const multi = await multiOperation.promise;
    expect(multiOperation.store.actions.map((item) => item.tool)).toEqual(['search_hospitals', 'search_packages']);
    expect(multi.findings.map((item) => item.kind)).toEqual(['hospitals', 'packages']);
    expect(multi.findings.every((item) => item.matchType === 'exact' && item.provenance.sourceKind === 'synthetic')).toBe(true);
  });

  it('returns honest zero results for Pune and for unsupported procedures', async () => {
    const pune = await run('Find hospitals in Pune', plan('discovery', [])).promise;
    expect(pune.findings).toEqual([]);
    expect(pune.discovery?.matchType).toBe('none');
    const unsupported = await run('Find hospitals for quantum transplant surgery in Mumbai', plan('discovery', [])).promise;
    expect(unsupported.findings).toEqual([]);
    expect(unsupported.summary).toMatch(/exact catalog match/i);
  });

  it('keeps basic catalog search available when the model is unavailable', async () => {
    const provider: LLMProvider = { generateStructured: async () => { throw new AgentError('MODEL_UNAVAILABLE', 'AI unavailable'); } };
    const store = new MemoryStore();
    const response = await runAgent({ content: 'Find cardiologists in Mumbai' }, { userId: id(2000), store, provider, caseAccess, tools: dependencies });
    expect(response.status).toBe('completed');
    expect(response.findings.map((item) => item.title)).toEqual(['Demo Cardiologist']);
    expect(response.discovery?.recovered).toBe(true);
    expect(store.diagnostics).toMatchObject({ modelPlanError: 'MODEL_UNAVAILABLE', recoveryResult: 'completed' });
  });
});
