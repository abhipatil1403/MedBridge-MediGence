import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
vi.mock('server-only', () => ({}));
import { orchestrate } from '@/lib/agents/orchestrator';
import { configuredProvider } from '@/lib/agents/cloudflare-provider';
import { createAdminClient, createUserClient, SupabaseAgentStore, SupabaseCaseAccess } from '@/lib/agents/persistence';
import { SupabasePlanningStore } from '@/lib/agents/treatment-planning/store';
import { updatePlanningTask } from '@/lib/agents/treatment-planning/task-actions';
import { AgentError } from '@/lib/agents/errors';

const ready = process.env.RUN_PLANNING_LIVE === '1' && Boolean(process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
it.skipIf(!ready)('persists and restores an authenticated multi-turn care plan with owner isolation', async () => {
  const admin = createAdminClient();
  const check = await admin.from('care_plans').select('id').limit(1);
  if (check.error) throw new Error('Apply the care-plan migration before running the live persistence test.');
  const users: string[] = [], conversations: string[] = [];
  async function newUser() {
    const email = `medbridge-plan-test-${randomUUID()}@example.invalid`, password = randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error('Temporary planning test user creation failed');
    users.push(created.data.user.id);
    const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const login = await auth.auth.signInWithPassword({ email, password });
    if (login.error || !login.data.session) throw new Error('Temporary planning test sign-in failed');
    return { id: created.data.user.id, db: createUserClient(login.data.session.access_token) };
  }
  try {
    const user = await newUser(), other = await newUser();
    const store = new SupabaseAgentStore(admin, user.db), planningStore = new SupabasePlanningStore(admin, user.db);
    const base = { userId: user.id, store, planningStore, caseAccess: new SupabaseCaseAccess(user.db), provider: configuredProvider() };
    const first = await orchestrate({ content: 'I need knee replacement treatment in Mumbai.' }, base);
    conversations.push(first.conversationId);
    expect(first.status, first.summary).toBe('completed'); expect(first.agent).toBe('treatment_planning');
    expect(first.tasks.map((task) => task.tool)).toEqual(expect.arrayContaining(['search_hospitals', 'search_packages']));
    expect(first.findings.some((item) => item.kind === 'hospitals')).toBe(true); expect(first.findings.some((item) => item.kind === 'packages')).toBe(true);
    expect(first.findings.every((item) => item.provenance.sourceKind === 'synthetic')).toBe(true);
    const packageFollowUp = await orchestrate({ content: 'Show me packages.', conversationId: first.conversationId }, base);
    expect(packageFollowUp.plan?.id).toBe(first.plan?.id); expect(packageFollowUp.question).toBeNull(); expect(packageFollowUp.tasks).toHaveLength(0);
    const budget = await orchestrate({ content: 'My budget is around $6000.', conversationId: first.conversationId }, base);
    expect(budget.plan?.context.budget?.amount).toBe(6000); expect(budget.plan?.id).toBe(first.plan?.id);
    const multi = await orchestrate({ content: 'I need knee replacement in Mumbai. Find hospitals, packages and doctors.', conversationId: first.conversationId }, base);
    expect(multi.plan?.id).toBe(first.plan?.id); expect(multi.tasks.some((task) => task.tool === 'search_doctors')).toBe(true);
    const restored = await new SupabasePlanningStore(admin, user.db).load(first.conversationId, user.id);
    expect(restored?.context).toMatchObject({ treatmentSlug: 'knee-replacement', city: 'Mumbai', budget: { amount: 6000 } });
    expect(new Set(restored?.tasks.map((task) => task.key)).size).toBe(restored?.tasks.length);
    const owned = await user.db.from('care_plans').select('id').eq('conversation_id', first.conversationId);
    const hidden = await other.db.from('care_plans').select('id').eq('conversation_id', first.conversationId);
    const hiddenTasks = await other.db.from('care_plan_tasks').select('id').eq('care_plan_id', first.plan!.id);
    expect(owned.data).toHaveLength(1); expect(hidden.data).toEqual([]); expect(hiddenTasks.data).toEqual([]);
    const deniedWrite = await user.db.from('care_plans').update({ status: 'completed' }).eq('id', first.plan!.id);
    expect(deniedWrite.error).not.toBeNull();
    const task = restored!.tasks.find((item) => item.taskType === 'preferences')!;
    const lease = randomUUID(); await planningStore.acquire(first.conversationId, user.id, lease);
    try { expect((await updatePlanningTask({ conversationId: first.conversationId, planId: first.plan!.id, taskId: task.id, action: 'complete' }, user.id, planningStore, lease)).tasks.find((item) => item.id === task.id)?.status).toBe('completed'); }
    finally { await planningStore.release(first.conversationId, lease); }
    const noModel = await orchestrate({ content: 'Which hospitals do we have?', conversationId: first.conversationId }, {
      ...base, provider: { generateStructured: async () => { throw new AgentError('MODEL_UNAVAILABLE', 'Unavailable'); } },
    });
    expect(noModel.status).toBe('completed'); expect(noModel.findings.some((item) => item.kind === 'hospitals')).toBe(true);
    const regressionQueries = ['Find me a hospital.', 'I need a heart doctor in Mumbai.', 'Find hospitals for underwater brain surgery in Mumbai.'];
    for (const content of regressionQueries) {
      const response = await orchestrate({ content }, base); conversations.push(response.conversationId);
      expect(response.plan).toBeUndefined(); expect(response.agent).toBe('discovery');
      if (content.includes('underwater')) expect(response.findings.every((item) => item.kind === 'treatments' && item.matchType === 'related')).toBe(true);
      if (content.includes('heart doctor')) { expect(response.question).toBeNull(); expect(response.findings.some((item) => item.kind === 'doctors')).toBe(true); }
      if (content === 'Find me a hospital.') expect(response.status).toBe('awaiting_user_input');
    }
    const runs = await admin.from('agent_runs').select('id,care_plan_id').eq('conversation_id', first.conversationId);
    expect(runs.data?.every((run) => run.care_plan_id === first.plan!.id)).toBe(true);
    const links = await admin.from('agent_tasks').select('care_plan_task_id').in('run_id', (runs.data ?? []).map((run) => run.id));
    expect(links.data?.every((task) => Boolean(task.care_plan_task_id))).toBe(true);
  } finally {
    // Cleanup only the temporary identities and their owned test data.
    const ownedConversations = await admin.from('conversations').select('id').in('owner_id', users);
    const ids = [...new Set([...conversations, ...(ownedConversations.data ?? []).map((item) => item.id)])];
    if (ids.length) {
      const runs = await admin.from('agent_runs').select('id').in('conversation_id', ids);
      const runIds = (runs.data ?? []).map((run) => run.id);
      if (runIds.length) {
        await admin.from('agent_outputs').delete().in('run_id', runIds);
        const actions = await admin.from('agent_actions').select('id').in('run_id', runIds);
        if (actions.data?.length) await admin.from('agent_approvals').delete().in('action_id', actions.data.map((action) => action.id));
        await admin.from('agent_actions').delete().in('run_id', runIds);
        await admin.from('agent_tasks').delete().in('run_id', runIds);
        await admin.from('agent_runs').delete().in('id', runIds);
      }
      await admin.from('conversations').delete().in('id', ids);
    }
    for (const id of users) await admin.auth.admin.deleteUser(id);
  }
}, 240000);
