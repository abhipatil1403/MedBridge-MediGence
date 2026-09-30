import { randomUUID } from 'node:crypto';
import { QueryNormalizer } from '@/lib/discovery/query-normalizer';
import type { CatalogSnapshot } from '@/types/catalog';
import type { LLMProvider } from '@/lib/ai/contracts';
import { discoveryRoute, routeToolDependencies, type DiscoveryRoute } from '../discovery-routing';
import { AgentError } from '../errors';
import { agents } from '../registry';
import { carePlanSchema, planSchema, type AgentPlan, type CarePlan, type Finding } from '../schemas';
import type { RuntimeContext } from '../runtime';
import { toolSchemas, type ToolDependencies } from '../tools';
import { resolvePlanningContext, planningQuestion } from './context';
import { derivePlanStatus, discoveryTask, PLANNING_LIMITS, upsertTask } from './tasks';
import type { PlanningStore } from './store';

export async function prepareTreatmentPlanning(input: { content: string; userId: string; conversationId: string;
  snapshot: CatalogSnapshot; active?: CarePlan; caseContext?: Record<string, unknown>; store: PlanningStore; lease: string; provider: LLMProvider; tools: ToolDependencies }): Promise<NonNullable<RuntimeContext['execution']>> {
  const { content, snapshot, active, userId, conversationId, store, lease } = input;
  const context = resolvePlanningContext(content, snapshot, active, input.caseContext);
  const question = planningQuestion(context);
  const subject = context.treatmentName ?? (context.specialty ? `${context.specialty} consultation` : 'Care');
  const location = context.city ?? context.country;
  const canonical = `Find ${context.requestedTargets.filter((item) => item !== 'services').join(' and ')} for ${context.treatmentName ?? context.specialty ?? 'treatment'}${location ? ` in ${location}` : ''}`;
  const tempRoute: DiscoveryRoute = { snapshot, normalized: QueryNormalizer.normalize(canonical, snapshot),
    plan: { agent: 'discovery', understanding: 'Search the catalog using the saved goal.', steps: [], missingInformation: question } };
  const cachedTools = routeToolDependencies(tempRoute, input.tools);
  const baseRoute = question ? tempRoute : await discoveryRoute(canonical, cachedTools.repository) ?? tempRoute;
  const plan: CarePlan = carePlanSchema.parse(active ? { ...active, context } : {
    id: randomUUID(), userId, conversationId, title: `${subject} plan${location ? ` · ${location}` : ''}`.slice(0, 160),
    goal: content, status: 'draft', context, tasks: [], findings: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  if (active && (active.status === 'cancelled' || /\b(cancel|stop)\s+(?:this\s+|my\s+|the\s+)?(?:care\s+)?plan\b/i.test(content))) {
    for (const task of plan.tasks) if (task.status !== 'completed') task.status = 'cancelled';
    plan.status = 'cancelled'; plan.updatedAt = new Date().toISOString();
    await store.save(plan, lease);
    const cancelledPlan: AgentPlan = { agent: 'treatment_planning', understanding: 'This coordination plan is cancelled.', steps: [], missingInformation: null };
    return { plan: cancelledPlan, route: { ...tempRoute, plan: cancelledPlan }, carePlanId: plan.id,
      finalize: async (response) => ({ ...response, type: 'progress', plan, findings: [], question: null,
        summary: 'Your coordination plan is cancelled. Previously saved catalog findings remain available in its history.', nextSteps: ['Start a new conversation for another planning goal.'] }) };
  }
  const scopeChanged = active && ['treatmentSlug', 'specialty', 'city', 'country', 'budget', 'preferredHospital', 'consultationMode']
    .some((key) => JSON.stringify(active.context[key as keyof typeof context]) !== JSON.stringify(context[key as keyof typeof context]));
  const goalChanged = active && ['treatmentSlug', 'specialty', 'city', 'country'].some((key) => active.context[key as keyof typeof context] !== context[key as keyof typeof context]);
  if (goalChanged) {
    plan.title = `${subject} plan${location ? ` · ${location}` : ''}`.slice(0, 160);
    if (context.treatmentSlug !== active.context.treatmentSlug) plan.goal = content;
    for (const task of plan.tasks) if (task.taskType !== 'external_action') { task.status = 'cancelled'; task.findings = []; }
    plan.findings = [];
  }
  const steps: AgentPlan['steps'] = question ? [] : baseRoute.plan.steps.map((step) => {
    const args: Record<string, unknown> = JSON.parse(step.input);
    args.query = `Find ${step.tool.replace('search_', '')} for ${context.treatmentName ?? context.specialty}${location ? ` in ${location}` : ''}`;
    if (step.tool === 'search_packages' && context.budget?.currency === 'USD') args.budget = context.budget.amount;
    if (context.preferredHospital && ['search_hospitals', 'search_packages', 'search_doctors'].includes(step.tool)) args.hospital = context.preferredHospital;
    if (step.tool === 'search_doctors' && context.consultationMode) args.mode = context.consultationMode;
    // Input keys have stable order so a repeated request reuses the completed search.
    const validated = toolSchemas[step.tool].parse(args);
    return { ...step, objective: `Find ${step.tool.replace('search_', '')} for ${subject}${location ? ` in ${location}` : ''}`.slice(0, 160), input: JSON.stringify(validated) };
  });
  if (!question && context.requestedTargets.includes('services')) steps.push({ tool: 'search_services', input: JSON.stringify({ query: 'consultation' }), objective: 'Find catalog consultation services' });
  if (steps.length > PLANNING_LIMITS.maxSteps) throw new AgentError('PLAN_LIMIT', 'Please narrow this planning request.');
  if (question) upsertTask(plan.tasks, 'clarify_goal', { title: question, taskType: 'clarification', requiresUserAction: true, status: 'awaiting_user' });
  else {
    const clarification = plan.tasks.find((task) => task.key === 'clarify_goal');
    if (clarification) clarification.status = 'completed';
    for (const step of steps) {
      const task = discoveryTask(plan.tasks, step);
      if (task.status === 'cancelled' || task.status === 'blocked') task.status = 'pending';
      const reviewKey = `review_${step.tool}`;
      upsertTask(plan.tasks, reviewKey, { title: `Review ${step.tool.replace('search_', '')} options`, taskType: 'review', requiresUserAction: true,
        ...(task.status !== 'completed' ? { status: 'pending' as const } : {}) });
    }
    upsertTask(plan.tasks, 'preferences', { title: context.goalType === 'consultation' ? 'Confirm your preferred consultation path' : 'Confirm preferences or keep the current search',
      description: 'Budget and preferred provider are optional. Completing this task confirms the planning preferences only.', taskType: 'preferences', requiresUserAction: true,
      ...(scopeChanged ? { status: 'pending' as const } : {}) });
  }
  const runnable = steps.filter((step) => plan.tasks.find((task) => task.key === step.tool)?.status !== 'completed');
  const diagnostics: Record<string, string | boolean | null> = { workflow: 'treatment_planning', carePlanId: plan.id, agentDepth: '1',
    reusedPlan: Boolean(active), reusedSearches: runnable.length < steps.length, modelAttempts: '0' };
  const understanding = `You're planning ${subject}${location ? ` in ${location}` : ''}.`;
  let executionPlan: AgentPlan = { agent: 'treatment_planning', understanding, steps: runnable, missingInformation: question };
  if (runnable.length) {
    diagnostics.modelAttempts = '1';
    try {
      const suggested = planSchema.parse(await input.provider.generateStructured({ purpose: 'plan', schema: planSchema, maxOutputTokens: 1300, timeoutMs: 15000,
        system: `${agents.treatment_planning.safety} Organize the supplied required catalog searches into a sensible order. Return agent treatment_planning and exactly the supplied tools and arguments. Do not add clinical claims, external actions, mandatory budgets, or optional locality questions. Keep all sourced criteria.`,
        input: JSON.stringify({ context, requiredPlan: executionPlan, missingInformation: question }) }));
      const signature = (step: AgentPlan['steps'][number]) => `${step.tool}:${JSON.stringify(toolSchemas[step.tool].parse(JSON.parse(step.input)))}`;
      const required = new Set(runnable.map(signature));
      if (suggested.agent !== 'treatment_planning' || suggested.missingInformation || suggested.steps.length !== required.size
        || new Set(suggested.steps.map(signature)).size !== required.size || suggested.steps.some((step) => !required.has(signature(step))))
        throw new AgentError('PLAN_RELEVANCE_OVERRIDE', 'The supplied goal will be searched directly.');
      executionPlan = { ...executionPlan, steps: suggested.steps.map((step) => runnable.find((candidate) => signature(candidate) === signature(step))!) };
    } catch (error) {
      diagnostics.modelPlanError = error instanceof AgentError ? error.code : 'PLAN_SCHEMA_INVALID';
      diagnostics.validationError = 'Model suggestion did not satisfy the bounded planning contract.';
      diagnostics.recoveryAttempted = true;
    }
  }
  for (const step of executionPlan.steps) plan.tasks.find((task) => task.key === step.tool)!.status = 'in_progress';
  plan.status = derivePlanStatus(plan.tasks, plan.findings.length > 0);
  plan.updatedAt = new Date().toISOString();
  await store.save(plan, lease);
  const taskLinks = Object.fromEntries(executionPlan.steps.map((step) => [`${step.tool}:${step.input}`, plan.tasks.find((task) => task.key === step.tool)!.id]));
  return { plan: executionPlan, route: { ...baseRoute, plan: executionPlan }, carePlanId: plan.id, taskLinks, diagnostics,
    finalize: async (response, results) => {
      for (const executed of response.tasks) {
        const task = plan.tasks.find((item) => item.key === executed.tool);
        if (!task) continue;
        task.runId = response.runId; task.agentTaskId = executed.id;
        task.status = executed.status === 'completed' ? 'completed' : 'blocked';
        task.findings = results.find((item) => item.tool === executed.tool)?.result.findings ?? [];
        task.updatedAt = new Date().toISOString();
        const review = plan.tasks.find((item) => item.key === `review_${executed.tool}`);
        if (review && !task.findings.length) { review.status = 'blocked'; review.description = 'No catalog matches meet the saved criteria. Adjust the search before reviewing options.'; }
        else if (review && review.status === 'blocked') { review.status = 'pending'; review.description = ''; }
      }
      // A runtime failure before task creation must not leave a saved task running indefinitely.
      for (const task of plan.tasks) if (task.status === 'in_progress') {
        task.status = 'blocked'; task.updatedAt = new Date().toISOString();
      }
      plan.findings = uniqueFindings(plan.tasks.filter((task) => task.status === 'completed' && task.taskType === 'discovery').flatMap((task) => task.findings));
      plan.status = derivePlanStatus(plan.tasks, plan.findings.length > 0);
      plan.updatedAt = new Date().toISOString();
      const saved = await store.save(plan, lease);
      const selectedFindings = uniqueFindings(steps.flatMap((step) => plan.tasks.find((task) => task.key === step.tool)?.findings ?? []));
      const cheapest = /\b(cheapest|lowest|compare)\b/i.test(content) ? packageComparison(plan.findings) : undefined;
      const summary = response.status === 'failed' ? 'Part of this catalog search could not finish. Your plan and completed findings are saved; you can retry.'
        : question ? 'Your planning goal is saved. I need one detail before searching the catalog.'
          : cheapest ?? (selectedFindings.length ? 'Based on the available catalog, I saved the matching records in your plan. Review the sourced options and confirm your preferences. This is a coordination plan, not a clinical treatment decision.'
            : 'No catalog options meet the saved criteria. Your plan is saved so you can adjust the treatment or destination.');
      const nextSteps = question ? [question] : ['Review the sourced options in your plan.', 'Confirm preferences or share an optional budget or preferred provider.'];
      if (context.budget?.currency === 'INR') nextSteps.push('Your INR budget is saved. USD sample prices have not been converted or filtered by it.');
      // Reused findings are not in this run's tool outputs; describe the findings actually returned.
      const matchType = selectedFindings.some((finding) => finding.matchType === 'exact') ? 'exact'
        : selectedFindings.length ? 'related' : 'none';
      const discovery = response.discovery && !question ? { ...response.discovery, matchType: matchType as 'exact' | 'related' | 'none',
        matchReason: selectedFindings.length ? 'Saved catalog records meet the current planning search criteria.'
          : 'No saved catalog records meet the current planning search criteria.' } : response.discovery;
      return { ...response, understanding, summary, findings: selectedFindings, plan: saved, question,
        discovery,
        status: response.status === 'failed' ? 'failed' : question ? 'awaiting_user_input' : 'completed',
        type: response.status === 'failed' ? 'error' : question ? 'clarification' : runnable.length ? 'planning' : 'progress',
        nextSteps, questions: question ? [question] : [], nextActions: nextSteps,
        sources: saved.findings.map((finding) => finding.provenance) };
    } };
}

function uniqueFindings(findings: Finding[]) { return [...new Map(findings.map((item) => [item.provenance.recordId, item])).values()].slice(0, 30); }
function packageComparison(findings: Finding[]): string | undefined {
  const packages = findings.filter((item) => item.kind === 'packages' && typeof item.facts.samplePriceUsd === 'number')
    .sort((a, b) => Number(a.facts.samplePriceUsd) - Number(b.facts.samplePriceUsd));
  const first = packages[0];
  if (!first) return 'No comparable package prices are available for the saved criteria. I cannot determine a lowest price.';
  const hospital = typeof first.facts.hospitalName === 'string' ? first.facts.hospitalName : first.title;
  const demo = first.provenance.sourceKind === 'synthetic';
  return `Among the ${packages.length} sourced package ${packages.length === 1 ? 'record' : 'records'} saved in this plan, ${hospital} has the lowest listed ${demo ? 'synthetic sample' : 'catalog'} package price: USD ${Number(first.facts.samplePriceUsd).toLocaleString('en-US')}. ${demo ? 'This is demo data, not a live offer.' : 'This is catalog pricing, not a current provider quote.'} Inclusions and additional costs may differ; a clinician must assess suitability.`;
}
