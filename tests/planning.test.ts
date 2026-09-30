import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
vi.mock('server-only', () => ({}));
import { orchestrate } from '@/lib/agents/orchestrator';
import { AgentError } from '@/lib/agents/errors';
import { assistantResponseSchema, carePlanSchema, type AgentResponse, type CarePlan } from '@/lib/agents/schemas';
import type { AgentStore } from '@/lib/agents/persistence';
import type { PlanningStore } from '@/lib/agents/treatment-planning/store';
import { SupabasePlanningStore } from '@/lib/agents/treatment-planning/store';
import { updatePlanningTask } from '@/lib/agents/treatment-planning/task-actions';
import { derivePlanStatus, PLANNING_LIMITS } from '@/lib/agents/treatment-planning/tasks';
import { SearchService } from '@/lib/discovery/search-service';
import { executeTool, type ToolDependencies } from '@/lib/agents/tools';
import type { CatalogRepository, CatalogSnapshot, Treatment, Hospital, Doctor, Package } from '@/types/catalog';
import type { LLMProvider } from '@/lib/ai/contracts';

const userId = randomUUID();
const record = (slug: string, name: string) => ({ recordId: randomUUID(), sourceRecordId: randomUUID(), slug, name,
  aliases: [], description: `${name} synthetic sample record`, demo: true, sourceKind: 'synthetic' as const });
const knee: Treatment = { ...record('knee-replacement', 'Knee Replacement'), specialty: 'Orthopedics', category: 'Surgery', overview: '', procedure: '',
  indications: '', diagnostics: '', recovery: '', typicalStayDays: 5, sampleBaseCostUsd: 5000, countries: ['india'], faqs: [] };
const brain: Treatment = { ...knee, ...record('brain-and-spine-surgery', 'Brain & Spine Surgery'), aliases: ['brain surgery'], specialty: 'Neurology' };
const hospital: Hospital = { ...record('mumbai-demo', 'Mumbai Demo Hospital'), city: 'Mumbai', country: 'india', specialties: ['Orthopedics'],
  treatmentSlugs: ['knee-replacement'], sampleBedCount: 20, sampleAccreditation: '', verification: 'Demo — unverified', infrastructure: [] };
const doctor: Doctor = { ...record('knee-doctor', 'Demo Knee Doctor'), city: 'Mumbai', country: 'india', specialty: 'Orthopedics',
  treatmentSlugs: ['knee-replacement'], hospitalSlug: hospital.slug, hospitalName: hospital.name, sampleExperienceYears: 10, languages: ['English'],
  consultationMode: 'both', verification: 'Demo — unverified', qualifications: [] };
const cardiologist: Doctor = { ...doctor, ...record('heart-doctor', 'Demo Cardiologist'), specialty: 'Cardiology', treatmentSlugs: [] };
const pkg: Package = { ...record('knee-package', 'Demo Knee Package'), treatmentSlug: knee.slug, hospitalSlug: hospital.slug, hospitalName: hospital.name,
  country: 'india', durationDays: 6, samplePriceUsd: 5500, inclusions: [], exclusions: [], benefits: [] };
const snapshot: CatalogSnapshot = { treatments: [knee, brain], hospitals: [hospital], doctors: [doctor, cardiologist], packages: [pkg],
  countries: [{ ...record('india', 'India'), code: 'IN', travelNote: '' }], services: [{ ...record('consultation', 'Consultation'), href: '/consultation', category: 'plan', steps: [] }], estimates: [] };
const repository: CatalogRepository = { loadSnapshot: async () => snapshot, listTreatments: async () => snapshot.treatments,
  listHospitals: async () => snapshot.hospitals, listDoctors: async () => snapshot.doctors, listPackages: async () => snapshot.packages,
  listCountries: async () => snapshot.countries, listServices: async () => snapshot.services, listPriceEstimates: async () => [],
  findCandidateSlugs: async () => ({ treatments: new Set(snapshot.treatments.map((item) => item.slug)), hospitals: new Set([hospital.slug]), doctors: new Set(snapshot.doctors.map((item) => item.slug)),
    packages: new Set([pkg.slug]), countries: new Set(['india']), services: new Set(['consultation']) }) };
const search = new SearchService(repository);
const tools: ToolDependencies = { repository, search: (query, type, filters) => search.search({ q: query, type, ...filters, sort: 'relevance' }),
  compare: async () => undefined };
const caseAccess = { readContext: async () => ({}), readDocumentMetadata: async () => [] };
const unavailable: LLMProvider = { generateStructured: async () => { throw new AgentError('MODEL_UNAVAILABLE', 'Unavailable'); } };

class MemoryPlanningStore implements PlanningStore {
  plans = new Map<string, CarePlan>(); messages = new Map<string, Array<{ role: string; content: string }>>(); locks = new Map<string, string>();
  saves = 0;
  async load(conversationId: string, owner: string) { const plan = this.plans.get(conversationId); return plan?.userId === owner ? structuredClone(plan) : undefined; }
  async save(plan: CarePlan, lease: string) {
    if (this.locks.get(plan.conversationId) !== lease) throw new Error('Lease required');
    const existing = this.plans.get(plan.conversationId);
    if (existing && existing.id !== plan.id) throw new Error('Duplicate plan');
    const saved = carePlanSchema.parse(structuredClone(plan)); this.plans.set(plan.conversationId, saved); this.saves++; return saved;
  }
  async acquire(conversationId: string, _owner: string, lease: string) { if (this.locks.has(conversationId)) return false; this.locks.set(conversationId, lease); return true; }
  async release(conversationId: string, lease: string) { if (this.locks.get(conversationId) === lease) this.locks.delete(conversationId); }
  async recentMessages(conversationId: string) { return this.messages.get(conversationId) ?? []; }
}
function harness(provider = unavailable, dependencies = tools) {
  const planningStore = new MemoryPlanningStore(), conversations = new Set<string>(), outputs: AgentResponse[] = [], actions: string[] = [];
  const runLinks: string[] = [], taskLinks: string[] = [];
  const store: AgentStore = {
    createConversation: async () => { const id = randomUUID(); conversations.add(id); return id; },
    assertConversation: async (id) => { if (!conversations.has(id)) throw new AgentError('CONVERSATION_ACCESS_DENIED', 'Denied'); },
    addMessage: async (id, role, content) => { const messages = planningStore.messages.get(id) ?? []; messages.push({ role, content }); planningStore.messages.set(id, messages); },
    startRun: async (_conv, _user, _agent, _case, planId) => { if (planId) runLinks.push(planId); return randomUUID(); },
    createTask: async (_run, _agent, _objective, _tool, _case, taskId) => { if (taskId) taskLinks.push(taskId); return randomUUID(); },
    updateTask: async () => {}, recordAction: async (_run, _task, tool) => { actions.push(tool); return undefined; },
    saveOutput: async (_run, response) => { outputs.push(response); }, finishRun: async () => {},
  };
  const send = (content: string, conversationId?: string) => orchestrate({ content, conversationId }, { userId, planningStore, store, tools: dependencies, provider, caseAccess });
  return { send, planningStore, store, outputs, actions, runLinks, taskLinks };
}

describe('central orchestrator and treatment planning', () => {
  it('keeps existing discovery available until the planning migration is applied', async () => {
    const h = harness(); h.planningStore.acquire = async () => { throw new AgentError('PLANNING_MIGRATION_MISSING', 'Migration needed'); };
    const heart = await h.send('I need a heart doctor in Mumbai.');
    expect(heart.findings[0].title).toBe('Demo Cardiologist'); expect(heart.plan).toBeUndefined();
    await expect(h.send('I need knee replacement treatment in Mumbai.')).rejects.toMatchObject({ code: 'PLANNING_MIGRATION_MISSING' });
    expect(h.planningStore.saves).toBe(0);
  });
  it('restores Supabase timestamps with timezone offsets into the validated response', async () => {
    const h = harness(); const first = await h.send('I need knee replacement in Mumbai.'); const plan = first.plan!;
    const offsetTime = '2026-09-30T12:15:30.123456+00:00';
    const db = { from: (table: string) => {
      const query = {
        select: () => query, eq: () => query, order: () => query,
        maybeSingle: async () => ({ data: { id: plan.id, user_id: userId, conversation_id: plan.conversationId, title: plan.title,
          goal: plan.goal, status: plan.status, context: plan.context, findings: plan.findings, created_at: offsetTime, updated_at: offsetTime }, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ error: null, data: table === 'care_plan_tasks' ? plan.tasks.map((task) => ({
          id: task.id, task_key: task.key, title: task.title, description: task.description, task_type: task.taskType, status: task.status,
          priority: task.priority, requires_user_action: task.requiresUserAction, requires_approval: task.requiresApproval, approval_status: task.approvalStatus,
          metadata: { findings: task.findings }, updated_at: offsetTime })) : [] })),
      }; return query;
    } } as unknown as ConstructorParameters<typeof SupabasePlanningStore>[1];
    const restored = await new SupabasePlanningStore(db, db).load(plan.conversationId, userId);
    expect(restored?.createdAt).toBe('2026-09-30T12:15:30.123Z'); expect(restored?.tasks[0].updatedAt).toBe(restored?.createdAt);
    expect(() => carePlanSchema.parse(restored)).not.toThrow();
  });
  it('creates a sourced plan with hospital and package tasks, with model failure fallback', async () => {
    const h = harness(); const result = await h.send('I need knee replacement treatment in Mumbai.');
    expect(result.agent).toBe('treatment_planning'); expect(result.type).toBe('planning'); expect(result.status).toBe('completed');
    expect(result.plan?.context).toMatchObject({ treatmentSlug: knee.slug, city: 'Mumbai', country: 'india' });
    expect(h.actions).toEqual(['search_hospitals', 'search_packages']); expect(result.plan?.status).toBe('ready');
    expect(result.plan?.tasks.filter((task) => task.taskType === 'discovery').every((task) => task.status === 'completed' && task.runId && task.agentTaskId)).toBe(true);
    expect(h.runLinks).toEqual([result.plan!.id]); expect(h.taskLinks).toHaveLength(2);
    expect(result.findings.every((finding) => finding.matchType === 'exact' && finding.provenance.sourceKind === 'synthetic' && finding.provenance.sourceRecordId)).toBe(true);
    expect(() => assistantResponseSchema.parse(result)).not.toThrow(); expect(h.outputs[0].plan?.id).toBe(result.plan?.id);
    expect(h.planningStore.messages.get(result.conversationId)?.at(-1)?.content).toBe(result.summary);
  });
  it('continues packages without repeating context, searches, plans, or tasks', async () => {
    const h = harness(); const first = await h.send('I need knee replacement in Mumbai.');
    const second = await h.send('Show me packages.', first.conversationId);
    expect(second.plan?.id).toBe(first.plan?.id); expect(second.question).toBeNull(); expect(second.tasks).toEqual([]);
    expect(second.findings.map((finding) => finding.kind)).toEqual(['packages']); expect(h.actions).toHaveLength(2);
    expect(second.plan?.tasks.map((task) => task.id)).toEqual(first.plan?.tasks.map((task) => task.id));
    expect(h.planningStore.plans.size).toBe(1); expect(second.plan?.context.city).toBe('Mumbai');
  });
  it('stores a USD budget and refreshes only the affected package search', async () => {
    const h = harness(); const first = await h.send('I need knee replacement in Mumbai.');
    const updated = await h.send('My budget is around $5000.', first.conversationId);
    expect(updated.plan?.id).toBe(first.plan?.id); expect(updated.plan?.context.budget).toEqual({ amount: 5000, currency: 'USD', source: 'user' });
    expect(updated.tasks.map((task) => task.tool)).toEqual(['search_packages']); expect(updated.findings.some((item) => item.kind === 'packages')).toBe(false);
    expect(updated.question).toBeNull(); expect(updated.plan?.status).toBe('awaiting_user');
  });
  it('accepts an initial budget without treating it as a procedure name', async () => {
    const result = await harness().send('I need knee replacement in Mumbai. My budget is around $6000.');
    expect(result.plan?.context.budget?.amount).toBe(6000); expect(result.findings.some((finding) => finding.kind === 'packages')).toBe(true);
  });
  it('persists INR preferences without inventing a USD conversion', async () => {
    const result = await harness().send('I need knee replacement in Mumbai. My budget is INR 600000.');
    expect(result.plan?.context.budget?.currency).toBe('INR'); expect(result.nextSteps.join(' ')).toMatch(/not been converted/);
    expect(result.findings.some((finding) => finding.kind === 'packages')).toBe(true);
  });
  it('executes hospital, package and doctor discovery once in one plan', async () => {
    const h = harness(); const result = await h.send('I need knee replacement in Mumbai. Find hospitals, packages and doctors.');
    expect(h.actions).toEqual(['search_hospitals', 'search_doctors', 'search_packages']); expect(result.findings).toHaveLength(3);
    expect(new Set(result.plan?.tasks.map((task) => task.key)).size).toBe(result.plan?.tasks.length);
  });
  it('asks for treatment when packages have no plan context', async () => {
    const h = harness(); const result = await h.send('Show me packages.');
    expect(result.agent).toBe('discovery'); expect(result.question).toMatch(/what treatment/i); expect(result.plan).toBeUndefined(); expect(h.actions).toEqual([]);
  });
  it('keeps a planning goal awaiting one missing procedure, then resolves it', async () => {
    const h = harness(); const first = await h.send('Help me plan treatment in Mumbai.');
    expect(first.plan?.status).toBe('awaiting_user'); expect(first.question).toMatch(/treatment or procedure/i);
    const next = await h.send('Knee replacement.', first.conversationId);
    expect(next.plan?.id).toBe(first.plan?.id); expect(next.plan?.context.treatmentSlug).toBe(knee.slug); expect(next.question).toBeNull();
  });
  it('preserves discovery, heart-doctor and unsupported-procedure behavior', async () => {
    const h = harness(); const heart = await h.send('I need a heart doctor in Mumbai.');
    expect(heart.agent).toBe('discovery'); expect(heart.findings[0].title).toBe('Demo Cardiologist'); expect(heart.question).toBeNull();
    const missing = await h.send('Find me a hospital.'); expect(missing.question).toMatch(/surgery or procedure/i); expect(missing.plan).toBeUndefined();
    const unknown = await h.send('Find hospitals for underwater brain surgery in Mumbai.');
    expect(unknown.plan).toBeUndefined(); expect(unknown.discovery?.matchType).toBe('none');
    expect(unknown.findings.every((item) => item.kind === 'treatments' && item.matchType === 'related')).toBe(true);
  });
  it('compares saved package prices without re-querying or presenting a live offer', async () => {
    const h = harness(); const first = await h.send('I need knee replacement in Mumbai.');
    const comparison = await h.send('Which of the hospitals you found has the cheapest package?', first.conversationId);
    expect(comparison.plan?.id).toBe(first.plan?.id); expect(comparison.summary).toMatch(/USD 5,500/); expect(comparison.summary).toMatch(/synthetic sample/);
    expect(h.actions).toHaveLength(2);
  });
  it('does not complete a plan merely because searches completed', async () => {
    const h = harness(); const response = await h.send('I need knee replacement in Mumbai.');
    expect(response.plan?.status).not.toBe('completed'); const plan = response.plan!; const lease = randomUUID();
    await h.planningStore.acquire(plan.conversationId, userId, lease);
    for (const task of plan.tasks.filter((item) => item.requiresUserAction)) await updatePlanningTask({ conversationId: plan.conversationId, planId: plan.id, taskId: task.id, action: 'complete' }, userId, h.planningStore, lease);
    expect((await h.planningStore.load(plan.conversationId, userId))?.status).toBe('completed');
    await h.planningStore.release(plan.conversationId, lease);
  });
  it('keeps external actions awaiting approval and blocks marking them completed', async () => {
    const h = harness(); const response = await h.send('I need knee replacement in Mumbai.');
    const boundary = await h.send('Book a hospital consultation.', response.conversationId);
    expect(boundary.status).toBe('awaiting_approval'); const plan = (await h.planningStore.load(response.conversationId, userId))!;
    const task = plan.tasks.find((item) => item.taskType === 'external_action')!;
    expect(task.requiresApproval).toBe(true); expect(task.approvalStatus).toBe('pending');
    expect(task.runId).toBe(boundary.runId); expect(task.agentTaskId).toBe(boundary.tasks[0].id);
    expect(h.runLinks.at(-1)).toBe(plan.id); expect(h.taskLinks.at(-1)).toBe(task.id);
    expect(h.outputs.at(-1)?.plan?.id).toBe(plan.id);
    await expect(updatePlanningTask({ conversationId: plan.conversationId, planId: plan.id, taskId: task.id, action: 'complete' }, userId, h.planningStore, 'x')).rejects.toMatchObject({ code: 'TASK_ACTION_DENIED' });
    expect(derivePlanStatus(plan.tasks, true)).toBe('awaiting_user');
  });
  it('persists the existing plan with a clinical boundary without executing catalog tools', async () => {
    const h = harness(); const first = await h.send('I need knee replacement in Mumbai.');
    const boundary = await h.send('Do I need surgery?', first.conversationId);
    expect(boundary.plan?.id).toBe(first.plan?.id); expect(h.actions).toHaveLength(2);
    expect(h.outputs.at(-1)?.plan?.id).toBe(first.plan?.id); expect(h.runLinks.at(-1)).toBe(first.plan?.id);
    expect(boundary.summary).toMatch(/licensed clinician/i);
  });
  it('blocks unauthorized plans and run overlap', async () => {
    const h = harness(); const result = await h.send('I need knee replacement in Mumbai.');
    expect(await h.planningStore.load(result.conversationId, randomUUID())).toBeUndefined();
    await h.planningStore.acquire(result.conversationId, userId, randomUUID());
    await expect(h.send('Show me packages.', result.conversationId)).rejects.toMatchObject({ code: 'TURN_IN_PROGRESS' });
    expect(h.actions).toHaveLength(2);
  });
  it('enforces catalog tool permissions and rejects invalid model actions', async () => {
    const invalid: LLMProvider = { generateStructured: (async () => ({ agent: 'treatment_planning', understanding: 'x', steps: [{ tool: 'create_case', input: '{}', objective: 'Create a case' }], missingInformation: null })) as LLMProvider['generateStructured'] };
    const h = harness(invalid); const result = await h.send('I need knee replacement in Mumbai.');
    expect(result.status).toBe('completed'); expect(h.actions).toEqual(['search_hospitals', 'search_packages']);
    expect(result.summary).not.toMatch(/invalid action|schema error|best treatment/i);
    await expect(executeTool('compare_treatment_options', { treatment: knee.slug, firstCountry: 'india', secondCountry: 'turkey' }, { agent: 'treatment_planning', userId, caseAccess }, tools)).rejects.toMatchObject({ code: 'TOOL_DENIED' });
    expect(result.tasks.length).toBeLessThanOrEqual(PLANNING_LIMITS.maxSteps);
  });
  it('generates consultation-specific tasks', async () => {
    const result = await harness().send('I want a cardiology consultation in Mumbai.');
    expect(result.agent).toBe('treatment_planning'); expect(result.plan?.context.goalType).toBe('consultation');
    expect(result.tasks.map((task) => task.tool)).toEqual(['search_doctors', 'search_services']);
    expect(result.plan?.tasks.some((task) => task.title.includes('consultation path'))).toBe(true);
  });
  it('does not apply an unrelated saved surgery to a new specialty request', async () => {
    const h = harness(); const kneePlan = await h.send('I need knee replacement in Mumbai.');
    const heart = await h.send('Find cardiologists in Mumbai.', kneePlan.conversationId);
    expect(heart.agent).toBe('discovery'); expect(heart.findings[0].title).toBe('Demo Cardiologist');
    const consultation = await h.send('I want a cardiology consultation in Mumbai.', kneePlan.conversationId);
    expect(consultation.plan?.id).toBe(kneePlan.plan?.id); expect(consultation.plan?.context.treatmentSlug).toBeUndefined();
    expect(consultation.findings.some((finding) => finding.title === 'Demo Cardiologist')).toBe(true);
    expect(consultation.plan?.findings.some((finding) => finding.kind === 'packages')).toBe(false);
  });
  it('preserves a partial plan when a tool fails and releases the turn lease', async () => {
    const failing: ToolDependencies = { ...tools, search: async (q, type, filters) => { if (type === 'packages') throw new Error('secret database error'); return tools.search(q, type, filters); } };
    const h = harness(unavailable, failing); const result = await h.send('I need knee replacement in Mumbai.');
    expect(result.status).toBe('failed'); expect(result.plan?.findings.some((item) => item.kind === 'hospitals')).toBe(true);
    expect(result.summary).not.toContain('secret database error'); expect(h.planningStore.locks.size).toBe(0);
    expect(result.plan?.tasks.some((task) => task.status === 'in_progress')).toBe(false);
  });
  it('cancels only unfinished coordination tasks without another search', async () => {
    const h = harness(); const first = await h.send('I need knee replacement in Mumbai.');
    const cancelled = await h.send('Cancel my plan.', first.conversationId);
    expect(cancelled.plan?.status).toBe('cancelled'); expect(cancelled.tasks).toEqual([]); expect(h.actions).toHaveLength(2);
    expect(cancelled.plan?.tasks.filter((task) => task.requiresUserAction).every((task) => task.status === 'cancelled')).toBe(true);
    const followUp = await h.send('Show me packages.', first.conversationId);
    expect(followUp.plan?.status).toBe('cancelled'); expect(h.actions).toHaveLength(2);
  });
});
