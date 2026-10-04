import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', async () => {
  const { getIsolatedFixtureClient } = await import('./fixtures/live-catalog-client');
  return { getPublicSupabaseClient: getIsolatedFixtureClient };
});
import { orchestrate } from '@/lib/agents/orchestrator';
import { SupabasePlanningStore } from '@/lib/agents/treatment-planning/store';
import type { LLMProvider } from '@/lib/ai/contracts';
import { runAgent } from '@/lib/agents/runtime';
import { createAdminClient, createUserClient, SupabaseAgentStore, SupabaseCaseAccess } from '@/lib/agents/persistence';
import { catalogRepository } from '@/lib/catalog/repository';
import { defaultToolDependencies } from '@/lib/agents/tools';
import { ExecutionState } from '@/lib/agents/execution-state';
import { executeRegisteredTool } from '@/lib/agents/tool-execution';
import type { Json } from '@/types/database';

const ready = process.env.RUN_AGENTIC_LIVE === '1' && Boolean(process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
it.skipIf(!ready)('persists real execution records, reloads owner activity, enforces RLS and avoids duplicate retry actions', async () => {
  const admin = createAdminClient(), users: string[] = [], conversations: string[] = [];
  const readObject = (v: Json | undefined): Record<string, Json | undefined> => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  async function identity() {
    const email = `medbridge-execution-${randomUUID()}@example.invalid`, password = randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error('Temporary test identity creation failed');
    users.push(created.data.user.id);
    const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const login = await auth.auth.signInWithPassword({ email, password });
    if (login.error || !login.data.session) throw new Error('Temporary test identity sign-in failed');
    return { id: created.data.user.id, db: createUserClient(login.data.session.access_token) };
  }
  try {
    const owner = await identity(), other = await identity();
    const store = new SupabaseAgentStore(admin, owner.db);
    const hospitals = await catalogRepository.listHospitals(), hospital = hospitals.find((h) => h.city.toLowerCase() === 'mumbai' && h.treatmentSlugs.includes('knee-replacement'));
    if (!hospital) throw new Error('Existing Mumbai knee catalog seed is required');
    const conversationId = await store.createConversation(owner.id); conversations.push(conversationId);
    const response = await runAgent({ content: 'Read selected catalog details', conversationId }, { userId: owner.id, store, caseAccess: new SupabaseCaseAccess(owner.db),
      provider: { generateStructured: async () => { throw new Error('No model required'); } }, execution: {
        plan: { agent: 'discovery', understanding: 'Read one selected sourced hospital', missingInformation: null, steps: [
          { tool: 'get_hospital', input: JSON.stringify({ slug: hospital.slug }), objective: 'Read selected hospital' },
          { tool: 'get_hospital_details', input: JSON.stringify({ slug: hospital.slug }), objective: 'Reuse the selected hospital detail' },
          { tool: 'search_packages', input: JSON.stringify({ query: 'knee replacement', hospital: hospital.slug }), objective: 'Read linked packages' },
        ] }, synthesis: { summary: 'Selected catalog records are available for review.', question: null, nextSteps: [] },
      } });
    expect(response.activity?.state).toBe('completed'); expect(response.activity?.steps[1].status).toBe('reused');
    const stored = await admin.from('agent_runs').select('metadata,agent_name').eq('id', response.runId).single(); expect(stored.error).toBeNull();
    const execution = readObject(readObject(stored.data?.metadata).execution);
    expect(execution.state).toBe('completed'); expect(execution.ownerId).toBe(owner.id); expect(execution.calls).toHaveLength(3);
    const calls = execution.calls as Array<Record<string, Json>>;
    expect(calls[0].validatedInput).toEqual({ slug: hospital.slug }); expect(readObject(calls[0].output).findings).toHaveLength(1);
    expect(calls[0].taskId).toBe(response.tasks[0].id); expect(calls[0].endedAt).toBeDefined();
    const actions = await admin.from('agent_actions').select('id,tool_name').eq('run_id', response.runId); expect(actions.data).toHaveLength(2);
    await store.saveOutput(response.runId, response);
    const outputs = await admin.from('agent_outputs').select('id,content').eq('run_id', response.runId); expect(outputs.data).toHaveLength(1);
    expect(await new SupabaseAgentStore(admin, owner.db).readActivity(conversationId, owner.id)).toMatchObject({ runId: response.runId, state: 'completed', steps: [{ status: 'completed' }, { status: 'reused' }, { status: 'completed' }] });
    await expect(new SupabaseAgentStore(admin, other.db).readActivity(conversationId, other.id)).rejects.toMatchObject({ code: 'CONVERSATION_ACCESS_DENIED' });
    await expect(new SupabaseAgentStore(admin, other.db).readActivity(conversationId, owner.id)).rejects.toMatchObject({ code: 'CONVERSATION_ACCESS_DENIED' });
    const hiddenConversations = await other.db.from('conversations').select('id').eq('id', conversationId); expect(hiddenConversations.data).toEqual([]);
    const hiddenMessages = await other.db.from('conversation_messages').select('id').eq('conversation_id', conversationId); expect(hiddenMessages.data).toEqual([]);
    const hiddenRuns = await other.db.from('agent_runs').select('id').eq('id', response.runId); expect(hiddenRuns.error || !hiddenRuns.data?.length).toBeTruthy();
    const forbidden = await owner.db.from('agent_runs').update({ metadata: {} }).eq('id', response.runId).select('id'); expect(forbidden.error || !forbidden.data?.length).toBeTruthy();
    const unchanged = await admin.from('agent_runs').select('metadata').eq('id', response.runId).single(); expect(readObject(readObject(unchanged.data?.metadata).execution).calls).toHaveLength(3);
    // Reload during an actual executing read, then fail a subsequent call. No framework-only mock persistence.
    const failureRun = await store.startRun(conversationId, owner.id, 'discovery');
    const state = new ExecutionState(failureRun, conversationId, owner.id, 'Check the selected hospital and packages', 'Read linked catalog records', store);
    await state.persist(); await state.transition('planning');
    const access = { agent: 'discovery' as const, userId: owner.id, caseAccess: new SupabaseCaseAccess(owner.db) };
    const read = executeRegisteredTool(state, { tool: 'get_hospital', input: { slug: hospital.slug } }, access, { ...defaultToolDependencies, repository: { ...catalogRepository,
      listHospitals: async () => { expect((await store.readActivity(conversationId, owner.id))?.state).toBe('executing'); return hospitals; } } });
    expect((await read).status).toBe('completed');
    const failure = await executeRegisteredTool(state, { tool: 'search_packages', input: { query: 'knee replacement', hospital: hospital.slug } }, access,
      { ...defaultToolDependencies, search: async () => { throw new Error('Controlled package service outage'); } });
    expect(failure.status).toBe('failed'); await state.transition('partially_completed');
    const reloaded = await new SupabaseAgentStore(admin, owner.db).readActivity(conversationId, owner.id);
    expect(reloaded?.state).toBe('partially_completed'); expect(reloaded?.steps.map((s) => s.status)).toEqual(['completed', 'failed']);
    const referenceConversation = await store.createConversation(owner.id); conversations.push(referenceConversation);
    const provider = { generateStructured: vi.fn(async () => { throw new Error('No model permitted for deterministic references'); }) };
    const base = { userId: owner.id, store, caseAccess: access.caseAccess, provider: provider as LLMProvider,
      planningStore: new SupabasePlanningStore(admin, owner.db) };
    const first = await orchestrate({ conversationId: referenceConversation,
      content: "Find knee replacement hospitals in Mumbai under $6,000, check their packages, tell me what's missing, and compare them." }, base);
    expect(first.findings.some(f => f.provenance.recordId === hospital.recordId)).toBe(true);
    const selectedPackage = (await catalogRepository.listPackages()).find(item => item.hospitalSlug === hospital.slug && item.treatmentSlug === 'knee-replacement')!;
    expect(first.findings.some(f => f.provenance.recordId === selectedPackage.recordId)).toBe(true);
    const before = provider.generateStructured.mock.calls.length;
    const invalid = await orchestrate({ conversationId: referenceConversation, content: 'Tell me more about the second one.' }, base);
    expect(invalid.pendingClarification?.query.entityType).toBe('hospital');
    const fresh = { ...base, planningStore: new SupabasePlanningStore(admin, owner.db), store: new SupabaseAgentStore(admin, owner.db) };
    const corrected = await orchestrate({ conversationId: referenceConversation, content: 'first one then' }, fresh);
    expect(corrected.referenceResolution?.reference?.entityId).toBe(hospital.recordId);
    const yes = await orchestrate({ conversationId: referenceConversation, content: 'yes' }, fresh);
    expect(yes.tasks).toEqual([]); expect(yes.question).toBeTruthy(); expect(yes.pendingClarification).toBeDefined();
    expect((await fresh.planningStore.load(referenceConversation, owner.id))?.context.pendingClarification?.id).toBe(yes.pendingClarification?.id);
    const packages = await orchestrate({ conversationId: referenceConversation, content: 'Show me its packages.' }, fresh);
    expect(packages.findings.some(f => f.provenance.recordId === selectedPackage.recordId)).toBe(true);
    expect(provider.generateStructured).toHaveBeenCalledTimes(before);
    expect(await new SupabasePlanningStore(admin, other.db).load(referenceConversation, other.id)).toBeUndefined();
    const records = await admin.from('agent_outputs').select('content').eq('run_id', yes.runId);
    expect(records.data).toHaveLength(1); expect(JSON.stringify(records.data)).not.toMatch(/facial plastic surgery/i);
    // Real retrieval only: no injected source fixtures or catalog writes.
    const researchConversation = await store.createConversation(owner.id); conversations.push(researchConversation);
    const researched = await orchestrate({ conversationId: researchConversation,
      content: 'Find current publicly listed knee replacement package information for hospitals in Mumbai.' }, fresh);
    expect(researched.research?.sources.length).toBeGreaterThan(0);
    expect(researched.research?.sources.every(s => s.sourceKind === 'external_source' && s.url.startsWith('https://'))).toBe(true);
    expect(researched.findings.every(f => f.sourceKind === 'medbridge_catalog')).toBe(true);
    const persisted = await admin.from('agent_outputs').select('content').eq('run_id', researched.runId).single();
    expect(readObject(persisted.data?.content).research).toBeDefined();
    const freshResearch = await orchestrate({ conversationId: researchConversation, content: 'Tell me more about the first external hospital.' },
      { ...fresh, store: new SupabaseAgentStore(admin, owner.db), planningStore: new SupabasePlanningStore(admin, owner.db) });
    expect(freshResearch.referenceResolution?.reference?.sourceKind).toBe('external_source');
    expect(freshResearch.tasks).toEqual([]);
    expect(freshResearch.research?.sources).toEqual(researched.research?.sources);
    const privateResearch = await other.db.from('conversation_messages').select('id').eq('conversation_id', researchConversation);
    expect(privateResearch.data).toEqual([]);
    expect((await catalogRepository.listHospitals()).map(h => h.recordId)).toEqual(hospitals.map(h => h.recordId));
  } finally {
    if (conversations.length) {
      const runs = await admin.from('agent_runs').select('id').in('conversation_id', conversations), runIds = runs.data?.map((r) => r.id) ?? [];
      if (runIds.length) for (const table of ['agent_outputs', 'agent_actions', 'agent_tasks'] as const) { const result = await admin.from(table).delete().in('run_id', runIds); if (result.error) throw new Error('Execution test cleanup failed'); }
      if (runIds.length) await admin.from('agent_runs').delete().in('id', runIds);
      await admin.from('conversations').delete().in('id', conversations);
    }
    for (const id of users) { const result = await admin.auth.admin.deleteUser(id); if (result.error) throw new Error('Test identity cleanup failed'); }
  }
}, 150000);
