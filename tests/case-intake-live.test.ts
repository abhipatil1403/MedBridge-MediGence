import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', async () => {
  const { getIsolatedFixtureClient } = await import('./fixtures/live-catalog-client');
  return { getPublicSupabaseClient: getIsolatedFixtureClient };
});
import { orchestrate } from '@/lib/agents/orchestrator';
import { createAdminClient, createUserClient, SupabaseAgentStore, SupabaseCaseAccess } from '@/lib/agents/persistence';
import { SupabasePlanningStore } from '@/lib/agents/treatment-planning/store';
import { caseFields } from '@/lib/case/CaseSchema';

const ready = process.env.RUN_CASE_INTAKE_LIVE === '1' && Boolean(process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
it.skipIf(!ready)('persists A–H case intake and denies another authenticated account at every storage/API boundary', async () => {
  const admin = createAdminClient(), users: string[] = [];
  async function newUser() {
    const email = `medbridge-intake-test-${randomUUID()}@example.invalid`, password = randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error('Temporary intake test identity creation failed');
    users.push(created.data.user.id);
    const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const login = await auth.auth.signInWithPassword({ email, password });
    if (login.error || !login.data.session) throw new Error('Temporary intake test sign-in failed');
    return { id: created.data.user.id, db: createUserClient(login.data.session.access_token) };
  }
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const user = await newUser(), other = await newUser();
    const provider = { generateStructured: async () => { throw new Error('No model is needed for intake or matching'); } };
    const base = { userId: user.id, store: new SupabaseAgentStore(admin, user.db), planningStore: new SupabasePlanningStore(admin, user.db), caseAccess: new SupabaseCaseAccess(user.db), provider };
    const a = await orchestrate({ content: 'I have severe knee pain.' }, base);
    expect(a.status, a.summary).toBe('completed'); expect(a.patientCase?.symptoms[0].value).toBe('severe knee pain');
    let latest = a;
    for (const content of ['It has been going on for about eight months. My doctor mentioned knee replacement.', "I had an MRI last month and I'm taking painkillers.", 'What information are you missing?', 'Show me my case summary.', 'Actually, the MRI was two months ago.']) {
      latest = await orchestrate({ content, conversationId: a.conversationId }, base); expect(latest.status, latest.summary).toBe('completed');
    }
    expect(latest.patientCase?.timeline.find((i) => i.key === 'mri')?.value).toBe('MRI: approximately 2 months ago');
    const g = await orchestrate({ content: 'Use this case to find knee replacement hospitals in Mumbai under $6,000.', conversationId: a.conversationId }, base);
    expect(g.agent, g.summary).toBe('hospital_matching'); expect(g.hospitalMatches?.length).toBeGreaterThan(0);
    expect(g.caseHandoff?.coordinationRequirements.find((r) => r.type === 'budget')?.maximum).toBe(6000);
    expect(g.caseHandoff?.reportedFacts.reportedDiagnosis).toEqual([]);
    const refreshedStore = new SupabasePlanningStore(admin, user.db);
    const restored = await refreshedStore.load(a.conversationId, user.id);
    expect(restored?.context.patientCase).toEqual(g.patientCase);
    const h = await orchestrate({ content: 'What information do you have about my case?', conversationId: a.conversationId }, { ...base, planningStore: refreshedStore });
    expect(h.patientCase?.id).toBe(a.patientCase?.id); expect(h.referenceResolution?.status).toBe('resolved');
    const privateTables = ['care_plans', 'conversation_messages', 'agent_runs'] as const;
    for (const table of privateTables) {
      const rows = await other.db.from(table).select('*').eq('conversation_id', a.conversationId); expect(rows.error).toBeNull(); expect(rows.data).toEqual([]);
    }
    const hiddenTasks = await other.db.from('care_plan_tasks').select('*').eq('care_plan_id', a.plan!.id); expect(hiddenTasks.data).toEqual([]);
    expect(await new SupabasePlanningStore(admin, other.db).load(a.conversationId, user.id)).toBeUndefined();
    await expect(orchestrate({ content: 'Show me my case summary.', conversationId: a.conversationId }, { ...base, userId: other.id,
      store: new SupabaseAgentStore(admin, other.db), planningStore: new SupabasePlanningStore(admin, other.db), caseAccess: new SupabaseCaseAccess(other.db) })).rejects.toMatchObject({ code: 'CONVERSATION_ACCESS_DENIED' });
    const messages = await user.db.from('conversation_messages').select('metadata,content').eq('conversation_id', a.conversationId).eq('role', 'user');
    for (const source of caseFields.flatMap((f) => h.patientCase![f]).flatMap((i) => i.sources)) {
      expect(messages.data?.some((m) => (m.metadata as { sourceId?: string })?.sourceId === source.messageSourceId && m.content.slice(source.start, source.end) === source.quote)).toBe(true);
    }
    const diagnosticText = JSON.stringify(log.mock.calls); expect(diagnosticText).not.toMatch(/knee pain|MRI|painkillers|eight months/); expect(errors).not.toHaveBeenCalled();
  } finally {
    log.mockRestore(); errors.mockRestore();
    const conversations = await admin.from('conversations').select('id').in('owner_id', users);
    const ids = (conversations.data ?? []).map((c) => c.id);
    if (ids.length) {
      const runs = await admin.from('agent_runs').select('id').in('conversation_id', ids); const runIds = (runs.data ?? []).map((r) => r.id);
      if (runIds.length) {
        const actions = await admin.from('agent_actions').select('id').in('run_id', runIds);
        if (actions.data?.length) await admin.from('agent_approvals').delete().in('action_id', actions.data.map((a) => a.id));
        for (const table of ['agent_outputs', 'agent_actions', 'agent_tasks', 'agent_runs'] as const) {
          const result = await admin.from(table).delete().in(table === 'agent_runs' ? 'id' : 'run_id', runIds);
          if (result.error) throw new Error('Temporary intake execution cleanup failed');
        }
      }
      const result = await admin.from('conversations').delete().in('id', ids); if (result.error) throw new Error('Temporary intake conversation cleanup failed');
    }
    for (const id of users) { const result = await admin.auth.admin.deleteUser(id); if (result.error) throw new Error('Temporary intake identity cleanup failed'); }
  }
}, 180000);
