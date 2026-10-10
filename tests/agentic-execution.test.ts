import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi, afterEach } from 'vitest';
vi.mock('server-only', () => ({}));
import { z } from 'zod';
import { ExecutionState, AGENT_LIMITS, canonicalInput, safeValue } from '@/lib/agents/execution-state';
import { executeRegisteredTool } from '@/lib/agents/tool-execution';
import { toolRegistry, type ToolDependencies } from '@/lib/agents/tools';
import { runAgent } from '@/lib/agents/runtime';
import { discoveryRoute } from '@/lib/agents/discovery-routing';
import { activitySchema, decisionSchema } from '@/lib/agents/execution-schemas';
import { SupabaseAgentStore } from '@/lib/agents/persistence';
import type { AgentStore } from '@/lib/agents/persistence';
import type { AgentResponse, AgentPlan } from '@/lib/agents/schemas';
import type { LLMProvider, ModelRequest } from '@/lib/ai/contracts';
import { tools, hospital, pkg, userId, harness } from './fixtures/comparison-harness';

const caseAccess = { readContext: async () => ({}), readDocumentMetadata: async () => [] };
const context = { agent: 'discovery' as const, userId, caseAccess };
function memory() {
  const saved: Record<string, unknown>[] = [], actions: string[] = [];
  let response: AgentResponse | undefined;
  const store: AgentStore = { createConversation: async () => randomUUID(), assertConversation: async () => {},
    addMessage: async () => {}, startRun: async () => randomUUID(), createTask: async () => randomUUID(), updateTask: async () => {},
    recordAction: async (_r, _t, name) => { actions.push(name); return undefined; },
    saveExecutionState: async (_r, state) => { saved.push(structuredClone(state)); }, saveOutput: async (_r, output) => { response = output; }, finishRun: async () => {} };
  return { store, saved, actions, output: () => response };
}
async function execution() { const m = memory(); const state = new ExecutionState(randomUUID(), randomUUID(), userId, 'Find catalog options', 'Read records', m.store); await state.persist(); await state.transition('planning'); return { ...m, state }; }
const call = (state: ExecutionState, tool = 'get_hospital_details', input: unknown = { slug: hospital.slug }, deps = tools, version?: string) => executeRegisteredTool(state, { tool, input, version }, context, deps);
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('registered execution boundary', () => {
  it('defines the required tools with complete execution metadata', () => {
    for (const id of ['search_hospitals', 'search_doctors', 'search_treatments', 'search_packages', 'get_hospital_details', 'get_doctor_details', 'get_treatment_details', 'get_package_details', 'compare_providers', 'check_requirements', 'search_locations'] as const) {
      expect(toolRegistry[id]).toMatchObject({ id, version: '1', permission: 'read', mode: 'read', failureHandling: 'observe_and_recover' });
      expect(toolRegistry[id].execute).toBeTypeOf('function'); expect(toolRegistry[id].timeoutMs).toBeGreaterThan(0);
    }
  });
  it.each(['eval', 'constructor', '__proto__', 'run_sql', 'send_email'])('rejects unregistered %s without a service call', async (name) => {
    const { state } = await execution(); const search = vi.fn(tools.search);
    const result = await call(state, name, {}, { ...tools, search });
    expect(result.error?.code).toBe('TOOL_UNKNOWN'); expect(search).not.toHaveBeenCalled(); expect(state.calls[0].status).toBe('failed');
  });
  it('rejects unavailable versions', async () => { expect((await call((await execution()).state, undefined, undefined, tools, '2')).error?.code).toBe('TOOL_VERSION_UNSUPPORTED'); });
  it('accepts the registered version', async () => { expect((await call((await execution()).state, undefined, undefined, tools, '1')).status).toBe('completed'); });
  it.each([{ slug: 'bad slug' }, { slug: hospital.slug, sql: 'select 1' }, null])('strictly rejects malformed detail input %j', async (input) => {
    const repository = { ...tools.repository, listHospitals: vi.fn(tools.repository.listHospitals) };
    const result = await call((await execution()).state, 'get_hospital_details', input, { ...tools, repository });
    expect(result.error?.code).toBe('TOOL_INPUT_INVALID'); expect(repository.listHospitals).not.toHaveBeenCalled();
  });
  it('applies an explicit package specialty through the existing search service', async () => {
    const result = await call((await execution()).state, 'search_packages', { query: 'catalog packages', city: 'Mumbai', specialty: 'Cardiology' });
    expect(result.status).toBe('empty'); expect(result.data?.findings).toEqual([]);
  });
  it('strictly rejects malformed search input', async () => { const search = vi.fn(tools.search); expect((await call((await execution()).state, 'search_hospitals', { query: '' }, { ...tools, search })).error?.code).toBe('TOOL_INPUT_INVALID'); expect(search).not.toHaveBeenCalled(); });
  it('validates service outputs', async () => {
    vi.spyOn(toolRegistry.get_hospital_details, 'execute').mockResolvedValue({ findings: [{}] } as never);
    expect((await call((await execution()).state)).error?.code).toBe('TOOL_OUTPUT_INVALID');
  });
  it('records identities, validated input, timestamps, output, and provenance', async () => {
    const { state, saved } = await execution(); const result = await call(state);
    expect(result.data?.findings[0].provenance.recordId).toBe(hospital.recordId);
    expect(state.calls[0]).toMatchObject({ runId: state.runId, step: 1, input: { slug: hospital.slug }, validatedInput: { slug: hospital.slug }, status: 'completed' });
    expect(state.calls[0].endedAt).toBeDefined(); expect(saved.at(-1)?.state).toBe('observing'); expect(result.provenance[0].kind).toBe('synthetic');
  });
  it('returns honest empty observations', async () => { const result = await call((await execution()).state, 'get_hospital_details', { slug: 'absent-hospital' }); expect(result.status).toBe('empty'); expect(result.data?.findings).toEqual([]); expect(result.warnings[0]).toMatch(/No matching/); });
  it('preserves successful observations after a failure', async () => {
    const { state } = await execution(); await call(state);
    const result = await call(state, 'search_packages', { query: 'knee' }, { ...tools, search: async () => { throw new Error('private password'); } });
    expect(state.observations[0].data?.findings).toHaveLength(1); expect(result.error?.message).not.toContain('password');
  });
  it('allows correction after invalid input', async () => { const { state } = await execution(); await call(state, 'get_hospital_details', { slug: '' }); expect((await call(state)).status).toBe('completed'); });
  it('reuses equal validated inputs across alias IDs', async () => {
    const { state } = await execution(); const repository = { ...tools.repository, listHospitals: vi.fn(tools.repository.listHospitals) };
    await call(state, 'get_hospital', { slug: hospital.slug }, { ...tools, repository });
    expect((await call(state, undefined, undefined, { ...tools, repository })).status).toBe('reused'); expect(repository.listHospitals).toHaveBeenCalledTimes(1);
  });
  it('canonicalizes property order while preserving array order', () => { expect(canonicalInput({ b: 2, a: 1 })).toBe(canonicalInput({ a: 1, b: 2 })); expect(canonicalInput([1, 2])).not.toBe(canonicalInput([2, 1])); });
  it('does not reuse expired results', async () => {
    const { state } = await execution(); await call(state); for (const entry of state.cache.values()) entry.at -= AGENT_LIMITS.cacheFreshMs + 1;
    expect((await call(state)).status).toBe('completed'); expect(state.executions).toBe(2);
  });
  it('caps executed calls', async () => { const { state } = await execution(); state.executions = AGENT_LIMITS.maxToolCalls; expect((await call(state)).error?.code).toBe('TOOL_BUDGET_EXHAUSTED'); });
  it('caps failure recovery', async () => { const { state } = await execution(); state.failures = AGENT_LIMITS.maxFailures; expect((await call(state)).error?.code).toBe('TOOL_BUDGET_EXHAUSTED'); });
  it('caps repeated calls', async () => {
    const { state } = await execution(); for (let i = 0; i < AGENT_LIMITS.maxRepeatedToolCalls; i++) await call(state, 'get_hospital_details', { slug: `missing-${i}` });
    expect((await call(state, 'get_hospital', { slug: hospital.slug })).error?.code).toBe('TOOL_BUDGET_EXHAUSTED');
  });
  it('enforces elapsed run time', async () => { vi.useFakeTimers(); const { state } = await execution(); vi.advanceTimersByTime(AGENT_LIMITS.runTimeoutMs + 1); expect((await call(state)).error?.code).toBe('TOOL_BUDGET_EXHAUSTED'); });
  it('times out a hanging read without losing prior results', async () => {
    vi.useFakeTimers(); const { state } = await execution(); await call(state);
    vi.spyOn(toolRegistry.search_packages, 'execute').mockImplementation(() => new Promise(() => {}));
    const pending = call(state, 'search_packages', { query: 'knee' }); await vi.advanceTimersByTimeAsync(AGENT_LIMITS.toolTimeoutMs * 2 + 201);
    expect((await pending).error?.code).toBe('TOOL_TIMEOUT'); expect(state.observations[0].status).toBe('completed');
  });
  it('rejects nested tool invocation', async () => { const { state } = await execution(); await state.transition('executing'); await expect(call(state)).rejects.toMatchObject({ code: 'TOOL_RECURSION_DENIED' }); });
  it('enforces agent permissions even for valid write arguments', async () => { expect((await call((await execution()).state, 'create_case', { title: 'Valid title' })).error?.code).toBe('TOOL_DENIED'); });
  it('blocks future executing writes before invoking the service', async () => {
    const definition = toolRegistry.get_hospital_details, previous = definition.mode;
    const invoke = vi.spyOn(definition, 'execute'); definition.mode = 'write';
    try { expect((await call((await execution()).state)).error?.code).toBe('TOOL_CONFIRMATION_REQUIRED'); expect(invoke).not.toHaveBeenCalled(); }
    finally { definition.mode = previous; }
  });
  it('does not execute reads without an authenticated owner', async () => { const { state } = await execution(); const result = await executeRegisteredTool(state, { tool: 'get_hospital', input: { slug: hospital.slug } }, { ...context, userId: '' }, tools); expect(result.error?.code).toBe('TOOL_DENIED'); });
  it('keeps credentials out of observations and saved state', async () => {
    const { state, saved } = await execution(); await call(state, 'search_hospitals', { query: 'sb_secret_testCredential12345', token: 'private' });
    expect(JSON.stringify(saved)).not.toContain('testCredential12345'); expect(JSON.stringify(saved)).not.toContain('"token":"private"');
    expect(safeValue({ apiKey: 'private' })).toEqual({ apiKey: '[redacted]' });
  });
  it('rejects credential-bearing service output', async () => {
    vi.spyOn(toolRegistry.get_hospital_details, 'execute').mockResolvedValue({ findings: [], note: 'sb_secret_testCredential12345' });
    const result = await call((await execution()).state); expect(result.error?.code).toBe('TOOL_OUTPUT_INVALID'); expect(JSON.stringify(result)).not.toContain('testCredential');
  });
  it('evaluates existing records with derived source IDs', async () => { const result = await call((await execution()).state, 'check_requirements', { recordIds: [pkg.recordId] }); expect(result.data?.analysis).toMatchObject({ kind: 'derived', recordIds: [pkg.recordId], complete: false }); });
  it('compares actual candidates without inventing another record', async () => { const result = await call((await execution()).state, 'compare_providers', { recordIds: [hospital.recordId] }); expect(result.data?.analysis?.complete).toBe(false); expect(result.data?.findings).toHaveLength(1); });
  it('rejects fabricated record IDs', async () => { expect((await call((await execution()).state, 'compare_providers', { recordIds: [randomUUID()] })).error?.code).toBe('TOOL_RECORD_UNAVAILABLE'); });
  it('scopes analysis to previously observed IDs', async () => { const { state } = await execution(); const result = await executeRegisteredTool(state, { tool: 'compare_providers', input: { recordIds: [hospital.recordId] } }, { ...context, observedRecordIds: [] }, tools); expect(result.error?.code).toBe('TOOL_SCOPE_DENIED'); });
});

describe('execution states and decisions', () => {
  it('persists queued, planning, executing, observing and completed', async () => { const { state, saved } = await execution(); await call(state); await state.transition('completed'); expect(saved.map((s) => s.state)).toEqual(expect.arrayContaining(['queued', 'planning', 'executing', 'observing', 'completed'])); });
  it.each(['partially_completed', 'failed', 'cancelled', 'waiting_for_input', 'awaiting_confirmation'] as const)('supports terminal %s without implicit resume', async (next) => {
    const { state } = await execution(); await state.transition(next); await expect(state.transition('executing')).rejects.toMatchObject({ code: 'RUN_STATE_INVALID' });
  });
  it('does not expose inputs or outputs in public activity', async () => { const { state } = await execution(); await call(state); expect(JSON.stringify(state.activity())).not.toContain(hospital.slug); expect(activitySchema.safeParse({ ...state.activity(), input: 'private' }).success).toBe(false); });
  it('validates required tool arguments in decisions', () => { expect(decisionSchema.safeParse({ action: 'call_tool', tool: null, version: '1', input: null, question: null }).success).toBe(false); });
  it('denies another owner before querying private run state', async () => {
    const store = new SupabaseAgentStore({ from: vi.fn() } as never, {} as never); const privateRead = vi.spyOn(store, 'assertConversation').mockRejectedValue(new Error('Denied'));
    await expect(store.readActivity(randomUUID(), randomUUID())).rejects.toThrow('Denied'); expect(privateRead).toHaveBeenCalledOnce();
  });
});

describe('existing runtime with model observation decisions', () => {
  const run = async (decisions: object[], dependencies: ToolDependencies = tools, steps?: AgentPlan['steps']) => {
    const m = memory(); const inputs: string[] = [];
    const initial: AgentPlan = { agent: 'discovery', understanding: 'Explore sourced catalog options', steps: steps ?? [{ tool: 'get_hospital', objective: 'Read hospital', input: JSON.stringify({ slug: hospital.slug }) }], missingInformation: null };
    const provider: LLMProvider = { generateStructured: async <T extends z.ZodType>(request: ModelRequest<T>) => {
      inputs.push(request.input); return (request.purpose === 'plan' ? initial : request.purpose === 'observe' ? decisions.shift() ?? { action: 'finish', tool: null, input: null, question: null, version: null }
        : { summary: 'Review the sourced catalog records.', nextSteps: [], question: null }) as z.infer<T>;
    } };
    // A selected authorized case keeps this test on the existing model-planned path.
    const response = await runAgent({ content: 'Explore my selected catalog options', caseId: randomUUID() }, { userId, store: m.store, provider, caseAccess, tools: dependencies });
    return { ...m, response, inputs };
  };
  const request = (tool: string, input: unknown) => ({ action: 'call_tool', tool, input: JSON.stringify(input), question: null, version: '1' });
  it('selects subsequent tools from actual returned IDs', async () => {
    const result = await run([request('get_package_details', { slug: pkg.slug }), request('compare_providers', { recordIds: [hospital.recordId, pkg.recordId] })]);
    expect(result.response.tasks.map((t) => t.tool)).toEqual(['get_hospital', 'get_package_details', 'compare_providers']); expect(result.inputs.some((s) => s.includes(hospital.recordId))).toBe(true); expect(result.response.activity?.state).toBe('partially_completed');
  });
  it('recovers a malformed next call using a structured error observation', async () => {
    const result = await run([request('get_package_details', { slug: '' }), request('get_package_details', { slug: pkg.slug })]);
    expect(result.inputs.some((s) => s.includes('TOOL_INPUT_INVALID'))).toBe(true); expect(result.response.findings.some((f) => f.kind === 'packages')).toBe(true);
  });
  it('preserves hospital findings when package search fails', async () => {
    const result = await run([request('search_packages', { query: 'knee' })], { ...tools, search: async () => { throw new Error('private service error'); } });
    expect(result.response.activity?.state).toBe('partially_completed'); expect(result.response.findings[0].provenance.recordId).toBe(hospital.recordId); expect(result.response.summary).not.toContain('private service');
  });
  it('rejects an array proposed as comparison arguments and preserves partial evidence', async () => {
    // Reproduces the hosted model proposal; no network or production failure injection.
    const execute = vi.spyOn(toolRegistry.compare_providers, 'execute');
    const result = await run([request('compare_providers', [hospital.recordId])]);
    expect(execute).not.toHaveBeenCalled();
    expect(result.response.status).toBe('failed');
    expect(result.response.activity?.state).toBe('partially_completed');
    expect(result.response.findings.map(f => f.provenance.recordId)).toEqual([hospital.recordId]);
    expect(result.response.tasks.at(-1)).toMatchObject({status:'failed',errorCode:'TOOL_INPUT_INVALID'});
    expect(result.response.summary).toContain('could not be completed');
    expect(result.saved.at(-1)?.state).toBe('partially_completed');
  });
  it('counts unique displayed records after a requirement check returns the same evidence', async () => {
    const route = await discoveryRoute('Find knee replacement hospitals in Mumbai', tools.repository);
    expect(route).toBeDefined();
    const m = memory();
    const decisions = [request('check_requirements', {recordIds:[hospital.recordId]}), request('compare_providers', [hospital.recordId])];
    const provider: LLMProvider = {generateStructured: async <T extends z.ZodType>() => decisions.shift() as z.infer<T>};
    const response = await runAgent({content:'Find knee replacement hospitals in Mumbai and check requirements'},
      {userId,store:m.store,provider,caseAccess,tools,execution:{plan:route!.plan,route}});
    expect(response.tasks.filter(t => t.status === 'completed')).toHaveLength(2);
    expect(response.findings).toHaveLength(1);
    expect(response.summary).toContain('I found 1 catalog record matching');
    expect(response.activity?.state).toBe('partially_completed');
    expect(m.output()?.summary).toBe(response.summary);
  });
  it('reuses a duplicate service call without creating another action', async () => { const result = await run([request('get_hospital_details', { slug: hospital.slug })]); expect(result.actions).toEqual(['get_hospital']); expect(result.response.activity?.steps[1].status).toBe('reused'); });
  it('bounds a model that requests the same call forever', async () => { const result = await run(Array.from({ length: 15 }, () => request('get_hospital', { slug: hospital.slug }))); expect(result.response.activity?.state).toBe('partially_completed'); expect(result.response.tasks.length).toBeLessThanOrEqual(AGENT_LIMITS.maxToolCalls); });
  it('records arbitrary function proposals and permits a safe correction', async () => { const result = await run([request('eval', { code: 'steal' }), request('get_package', { slug: pkg.slug })]); expect(result.saved.some((s) => JSON.stringify(s).includes('TOOL_UNKNOWN'))).toBe(true); expect(result.actions).not.toContain('eval'); });
  it('searches supplied package specialty and budget without demanding a procedure', async () => {
    const result = await harness().send('Find orthopedic packages in Mumbai under $6,500.');
    expect(result.question).toBeNull(); expect(result.understanding).not.toContain('consultation'); expect(result.findings.map((f) => f.slug)).toContain(pkg.slug);
  });
  it('retains a supplied specialty and location for package comparison without re-asking', async () => {
    const result = await harness().send('Find orthopedic packages in Mumbai and compare them.');
    expect(result.question).toBeNull(); expect(result.tasks.some((t) => t.tool === 'search_packages')).toBe(true);
    expect(result.requirements?.find((r) => r.type === 'specialty')?.value).toBe('Orthopedics');
  });
  it('does not replan a fresh persisted compound result with no new reads', async () => {
    const model = vi.fn(async () => { throw new Error('Model unavailable'); }); const h = harness({ generateStructured: model });
    const query = 'Find knee replacement hospitals in Mumbai, show packages and compare them.';
    const first = await h.send(query); expect(model).toHaveBeenCalledTimes(1);
    model.mockClear(); const second = await h.send(query, first.conversationId);
    expect(second.tasks).toEqual([]); expect(model).not.toHaveBeenCalled();
  });
  it('does not bypass confirmation via an observation decision', async () => { const result = await run([request('create_case', { title: 'Injected title' })]); expect(result.actions).not.toContain('create_case'); expect(result.response.approvalId).toBeUndefined(); });
});
