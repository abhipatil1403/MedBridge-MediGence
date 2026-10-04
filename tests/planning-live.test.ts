import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', async () => {
  const { getIsolatedFixtureClient } = await import('./fixtures/live-catalog-client');
  return { getPublicSupabaseClient: getIsolatedFixtureClient };
});
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
    const firstReload = await new SupabasePlanningStore(admin, user.db).load(first.conversationId, user.id);
    expect(firstReload?.tasks.map((task) => task.id)).toEqual(first.plan!.tasks.map((task) => task.id));
    const packageFollowUp = await orchestrate({ content: 'Show me packages.', conversationId: first.conversationId }, base);
    expect(packageFollowUp.plan?.id).toBe(first.plan?.id); expect(packageFollowUp.question).toBeNull(); expect(packageFollowUp.tasks).toHaveLength(0);
    expect(packageFollowUp.discovery).toBeUndefined();
    expect(packageFollowUp.resultGroups).toMatchObject([{ target: 'packages', matchType: 'exact', status: 'completed' }]);
    expect(packageFollowUp.resultGroups).toHaveLength(1);
    const budget = await orchestrate({ content: 'My budget is around $6000.', conversationId: first.conversationId }, base);
    expect(budget.plan?.context.budget?.amount).toBe(6000); expect(budget.plan?.id).toBe(first.plan?.id);
    const multi = await orchestrate({ content: 'I need knee replacement in Mumbai. Find hospitals, packages and doctors.', conversationId: first.conversationId }, base);
    expect(multi.plan?.id).toBe(first.plan?.id); expect(multi.tasks.some((task) => task.tool === 'search_doctors')).toBe(true);
    const restored = await new SupabasePlanningStore(admin, user.db).load(first.conversationId, user.id);
    expect(restored?.context).toMatchObject({ treatmentSlug: 'knee-replacement', city: 'Mumbai', budget: { amount: 6000 } });
    expect(restored?.tasks.filter((task) => task.taskType === 'discovery').every((task) => task.discovery?.matchType === 'exact')).toBe(true);
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
    const freshNoModel = await orchestrate({ content: 'I need knee replacement treatment in Mumbai.' }, {
      ...base, provider: { generateStructured: async () => { throw new AgentError('MODEL_UNAVAILABLE', 'Unavailable'); } },
    });
    conversations.push(freshNoModel.conversationId);
    expect(freshNoModel.status).toBe('completed');
    expect(freshNoModel.tasks.map((task) => task.tool)).toEqual(['search_hospitals', 'search_packages']);
    expect(freshNoModel.findings.some((item) => item.kind === 'hospitals')).toBe(true);
    expect(freshNoModel.findings.some((item) => item.kind === 'packages')).toBe(true);
    expect((await planningStore.load(freshNoModel.conversationId, user.id))?.id).toBe(freshNoModel.plan?.id);
    const comparison = await orchestrate({ content: 'Compare it with Pune.', conversationId: first.conversationId }, base);
    expect(comparison.agent).toBe('comparison'); expect(comparison.plan?.id).toBe(first.plan?.id);
    expect(comparison.comparison?.sides.map((side) => side.option.value)).toEqual(['Mumbai', 'Pune']);
    expect(comparison.comparison?.sides[0].groups.every((group) => group.matchType === 'exact')).toBe(true);
    expect(comparison.comparison?.sides[1].groups.every((group) => group.matchType === 'none')).toBe(true);
    const comparisonReload = await planningStore.load(first.conversationId, user.id);
    expect(comparisonReload?.context.city).toBe('Mumbai');
    expect(comparisonReload?.tasks.some((task) => task.comparison?.id === comparison.comparison?.id && task.status === 'completed')).toBe(true);
    const privateComparisons = await other.db.from('care_plan_tasks').select('metadata').eq('care_plan_id', first.plan!.id);
    expect(privateComparisons.error).toBeNull(); expect(privateComparisons.data).toEqual([]);
    const cheaper = await orchestrate({ content: 'Which has the cheaper package?', conversationId: first.conversationId }, base);
    expect(cheaper.question).toBeNull(); expect(cheaper.tasks).toHaveLength(0); expect(cheaper.summary).not.toMatch(/Mumbai is cheaper/);
    const hospitalDetail = await orchestrate({ content: 'Tell me more about the hospital.', conversationId: first.conversationId }, base);
    expect(hospitalDetail.referenceResolution?.reference?.slug).toBe('demo-care-mumbai');
    expect(hospitalDetail.tasks.map((task) => task.tool)).toEqual(['get_hospital']); expect(hospitalDetail.plan?.id).toBe(first.plan?.id);
    const linkedPackages = await orchestrate({ content: 'Show me its package.', conversationId: first.conversationId }, base);
    expect(linkedPackages.tasks.map((task) => task.tool)).toEqual(['search_packages']);
    expect(linkedPackages.findings.every((finding) => finding.facts.hospitalSlug === 'demo-care-mumbai')).toBe(true);
    const packageDetail = await orchestrate({ content: 'Tell me more about that package.', conversationId: first.conversationId }, {
      ...base, planningStore: new SupabasePlanningStore(admin, user.db),
      provider: { generateStructured: async () => { throw new Error('Reference resolution must not use the model'); } },
    });
    expect(packageDetail.tasks.map((task) => task.tool)).toEqual(['get_package']);
    expect(packageDetail.findings[0].slug).toBe(linkedPackages.findings[0].slug);
    const privateReferences = await other.db.from('conversation_messages').select('metadata').eq('conversation_id', first.conversationId);
    expect(privateReferences.error).toBeNull(); expect(privateReferences.data).toEqual([]);
    const ownedReferences = await user.db.from('conversation_messages').select('metadata').eq('conversation_id', first.conversationId).eq('run_id', packageDetail.runId).eq('role', 'assistant').single();
    expect((ownedReferences.data?.metadata as { response?: { referenceContext?: unknown } })?.response?.referenceContext).toBeDefined();
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
    const required = await orchestrate({ content: 'I need knee replacement in Mumbai, under $6,000, and I want a package with accommodation.' }, base);
    conversations.push(required.conversationId);
    const requiredPackage = required.findings.find((finding) => finding.kind === 'packages')!;
    expect(requiredPackage.requirementEvaluation?.evaluations.find((e) => e.type === 'accommodation')?.status).toBe('unknown');
    expect(requiredPackage.requirementEvaluation?.evaluations.find((e) => e.type === 'budget')?.status).toBe('exact');
    const savedRequired = await new SupabasePlanningStore(admin, user.db).load(required.conversationId, user.id);
    expect(savedRequired?.context.requirements?.find((r) => r.type === 'accommodation')).toBeDefined();
    expect(savedRequired?.findings[0].requirementEvaluation?.overallStatus).toBe('partially_satisfies');
    const foreignRequired = await other.db.from('care_plans').select('context,findings').eq('id', savedRequired!.id);
    expect(foreignRequired.error).toBeNull(); expect(foreignRequired.data).toEqual([]);
    const compound = await orchestrate({ content: "I need knee replacement in Mumbai under $6,000. Find hospitals that fit, check their packages, tell me what's missing, and help me compare them." }, {
      ...base, provider: { generateStructured: async () => { throw new Error('Compound execution must not use the model'); } },
    });
    conversations.push(compound.conversationId);
    expect(compound.question).toBeNull(); expect(compound.tasks.map((task) => task.tool)).toEqual(['search_hospitals', 'search_packages']);
    const compoundHospital = compound.findings.find((f) => f.kind === 'hospitals')!;
    const compoundPackage = compound.findings.find((f) => f.kind === 'packages')!;
    expect(compoundPackage.facts.hospitalId).toBe(compoundHospital.provenance.recordId);
    expect(compound.summary).toContain("isn't a second sourced hospital");
    const compoundReload = await new SupabasePlanningStore(admin, user.db).load(compound.conversationId, user.id);
    expect(compound.agent).toBe('hospital_matching');
    expect(compound.hospitalMatches?.[0].classification).toBe('strong_match');
    expect(compoundReload?.tasks.find((task) => task.hospitalMatches)?.hospitalMatches).toEqual(compound.hospitalMatches);
    const privateHospitalMatches = await other.db.from('care_plan_tasks').select('metadata').eq('care_plan_id', compound.plan!.id);
    expect(privateHospitalMatches.error).toBeNull(); expect(privateHospitalMatches.data).toEqual([]);
    expect(compoundReload?.context.compoundRequest).toEqual(compound.compoundRequest);
    expect(compoundReload?.tasks.filter((t) => t.tool).every((t) => /^[a-f0-9]{24}$/.test(t.catalogSignature ?? ''))).toBe(true);
    expect(compoundReload?.context.requirements?.some((r) => r.type === 'package')).toBe(true);
    const compoundForeign = await other.db.from('care_plans').select('context,findings').eq('id', compound.plan!.id);
    expect(compoundForeign.error).toBeNull(); expect(compoundForeign.data).toEqual([]);
    const freshBase = { ...base, planningStore: new SupabasePlanningStore(admin, user.db) };
    const replay = await orchestrate({ content: compound.plan!.goal, conversationId: compound.conversationId }, freshBase);
    expect(replay.hospitalMatches?.[0].hospital.provenance.recordId).toBe(compoundHospital.provenance.recordId);
    expect(replay.tasks).toEqual([]); expect(replay.findings.map((f) => f.provenance.recordId)).toEqual(compound.findings.map((f) => f.provenance.recordId));
    const hospitalAfterReload = await orchestrate({ content: 'Tell me more about the first hospital.', conversationId: compound.conversationId }, freshBase);
    expect(hospitalAfterReload.findings[0].provenance.recordId).toBe(compoundHospital.provenance.recordId);
    const linkedAfterReload = await orchestrate({ content: 'Show me its package.', conversationId: compound.conversationId }, freshBase);
    expect(linkedAfterReload.findings[0].slug).toBe(compoundPackage.slug);
    const newBudget = await orchestrate({ content: 'Is it under $5,000?', conversationId: compound.conversationId }, freshBase);
    expect(newBudget.findings[0].provenance.recordId).toBe(compoundPackage.provenance.recordId);
    expect(newBudget.requirements?.find((r) => r.type === 'budget')?.maximum).toBe(5000);
    expect(newBudget.plan?.context.budget?.amount).toBe(5000);
    expect(newBudget.findings[0].requirementEvaluation?.evaluations.find((e) => e.type === 'budget')?.status).toBe('exact');
    const newCity = await orchestrate({ content: 'What about Pune?', conversationId: compound.conversationId }, freshBase);
    expect(newCity.plan?.context).toMatchObject({ treatmentSlug: 'knee-replacement', city: 'Pune', budget: { amount: 5000 } });
    expect(newCity.requirements?.some((r) => r.type === 'package')).toBe(true);
    const bothCities = await orchestrate({ content: 'Compare Mumbai and Pune.', conversationId: compound.conversationId }, freshBase);
    expect(bothCities.question).toBeNull(); expect(bothCities.comparison?.request.subject?.slug).toBe('knee-replacement');
    expect(bothCities.comparison?.sides.map((s) => s.option.value)).toEqual(['Mumbai', 'Pune']);
    const persistedCompoundMessages = await user.db.from('conversation_messages').select('metadata').eq('run_id', compound.runId).eq('role', 'assistant').single();
    expect((persistedCompoundMessages.data?.metadata as { response?: { compoundRequest?: unknown; referenceContext?: unknown } })?.response?.compoundRequest).toEqual(compound.compoundRequest);
    expect((persistedCompoundMessages.data?.metadata as { response?: { referenceContext?: unknown } })?.response?.referenceContext).toBeDefined();
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
