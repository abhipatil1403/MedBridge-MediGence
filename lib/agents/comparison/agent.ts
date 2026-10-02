import { createHash, randomUUID } from 'node:crypto';
import type { CatalogSnapshot } from '@/types/catalog';
import { QueryNormalizer } from '@/lib/discovery/query-normalizer';
import { EntityMatcher } from '@/lib/discovery/entity-matcher';
import { carePlanSchema, comparisonSchema, type AgentPlan, type CarePlan, type Finding, type ComparisonRequest } from '../schemas';
import type { RuntimeContext } from '../runtime';
import type { ToolDependencies } from '../tools';
import { toolSchemas } from '../tools';
import type { PlanningStore } from '../treatment-planning/store';
import { derivePlanStatus, upsertTask } from '../treatment-planning/tasks';
import { discoveryMatch, planningResultGroup } from '../treatment-planning/results';
import { normalizeComparison } from './normalize';
import { comparisonSummary, missingFields } from './format';
import { packageAttributes } from '@/lib/requirements/RequirementTypes';

const unique = (findings: Finding[]) => [...new Map(findings.map((finding) => [finding.provenance.recordId, finding])).values()].slice(0, 30);
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);

export async function prepareComparison(input: { content: string; userId: string; conversationId: string; snapshot: CatalogSnapshot;
  active?: CarePlan; store: PlanningStore; lease: string; tools: ToolDependencies }): Promise<NonNullable<RuntimeContext['execution']>> {
  const { content, active, snapshot, store, lease } = input;
  if (active?.status === 'cancelled') {
    const cancelled: AgentPlan = { agent: 'comparison', understanding: 'This coordination plan is cancelled.', steps: [], missingInformation: null };
    return { plan: cancelled, route: { snapshot, normalized: QueryNormalizer.normalize(content, snapshot), plan: cancelled }, carePlanId: active.id,
      finalize: async (response) => ({ ...response, discovery: undefined, type: 'progress', plan: active, findings: [],
        summary: 'This coordination plan is cancelled. Start a new conversation to compare another goal.', nextSteps: ['Start a new conversation.'] }) };
  }
  const { request, question } = normalizeComparison(content, snapshot, active);
  const subject = request.subject;
  const unsupported = subject?.type === 'treatment' && subject.matchType !== 'exact';
  const now = new Date().toISOString();
  const plan: CarePlan = active ?? carePlanSchema.parse({ id: randomUUID(), userId: input.userId, conversationId: input.conversationId,
    title: `${subject?.value ?? 'Catalog'} comparison`.slice(0, 160), goal: content, status: 'draft', tasks: [], findings: [], createdAt: now, updatedAt: now,
    context: { goalType: 'treatment', requestedTargets: [], treatmentSlug: subject?.slug,
      treatmentName: subject?.type === 'treatment' && subject.matchType === 'exact' ? subject.value : undefined,
      treatmentId: snapshot.treatments.find((item) => item.slug === subject?.slug)?.recordId,
      specialty: subject?.type === 'specialty' ? subject.value : undefined } });
  // Reuse task infrastructure and its owner-only JSON metadata; no new task table/type is needed.
  const requestKey = digest({ ...request, focus: 'catalog' });
  const comparisonTask = upsertTask(plan.tasks, `comparison_${requestKey}`, { title: `Compare ${request.options.map((option) => option.label).join(' vs ') || 'catalog options'}`,
    taskType: 'discovery', comparisonRequest: request, description: 'Compare sourced catalog attributes; no clinical ranking or provider action.' });
  // Supersede pending comparison questions without altering existing planning context or destinations.
  for (const task of plan.tasks) if (task.id !== comparisonTask.id && task.comparisonRequest && task.status === 'awaiting_user') task.status = 'cancelled';
  const review = !question && !unsupported ? upsertTask(plan.tasks, `review_comparison_${requestKey}`, { title: 'Review the sourced comparison', taskType: 'review', requiresUserAction: true }) : undefined;
  const searches: Array<{ key: string; step: AgentPlan['steps'][number]; side?: number; target?: ComparisonRequest['targets'][number] }> = [];
  if (!question && !unsupported) {
    for (const [side, option] of request.options.entries()) for (const target of request.targets) {
      const args = { query: `Find ${target} for ${subject!.type === 'catalog' ? 'catalog records' : subject!.value} in ${option.label}`,
        treatment: subject?.type === 'treatment' ? subject.slug : undefined, specialty: subject?.type === 'specialty' ? subject.value : undefined,
        city: option.type === 'city' ? option.value : undefined, country: option.type === 'country' ? option.value : EntityMatcher.match(option.label, snapshot).country,
        budget: target === 'packages' && request.budget?.currency === 'USD' && !request.requirements?.some((r) => (packageAttributes as readonly string[]).includes(r.type)) ? request.budget.amount : undefined };
      const tool = `search_${target}` as 'search_hospitals' | 'search_packages' | 'search_doctors';
      const step = { tool, objective: `Find ${target} for ${option.label}`, input: JSON.stringify(toolSchemas[tool].parse(args)) };
      const cached = plan.tasks.find((task) => task.taskType === 'discovery' && task.status === 'completed' && task.tool === tool && task.input === step.input);
      searches.push({ key: cached?.key ?? `comparison_search_${digest({ tool, input: step.input })}`, step, side, target });
    }
  }
  const treatmentSlug = unsupported ? subject?.relatedSlug : subject?.type === 'treatment' ? subject.slug : undefined;
  if (!question && treatmentSlug) {
    const step = { tool: 'get_treatment' as const, objective: unsupported ? 'Read a related catalog treatment topic' : 'Read the comparison treatment', input: JSON.stringify({ slug: treatmentSlug }) };
    searches.push({ key: `comparison_subject_${digest(step.input)}`, step });
  }
  for (const search of searches) if (!plan.tasks.some((task) => task.key === search.key && task.status === 'completed'))
    upsertTask(plan.tasks, search.key, { title: search.step.objective, taskType: 'discovery', tool: search.step.tool, input: search.step.input });
  const runnable = searches.filter((search) => plan.tasks.find((task) => task.key === search.key)?.status !== 'completed');
  for (const search of runnable) { const task = plan.tasks.find((task) => task.key === search.key)!; task.status = 'in_progress'; task.findings = []; task.discovery = undefined; }
  comparisonTask.status = question ? 'awaiting_user' : 'in_progress';
  plan.status = derivePlanStatus(plan.tasks, plan.findings.length > 0); plan.updatedAt = now;
  await store.save(plan, lease);
  const executionPlan: AgentPlan = { agent: 'comparison', understanding: `Compare ${subject?.value ?? 'catalog information'}${request.options.length ? ` between ${request.options.map((option) => option.label).join(' and ')}` : ''}.`,
    steps: runnable.map((search) => search.step), missingInformation: question };
  const route = { snapshot, normalized: QueryNormalizer.normalize(content, snapshot), plan: executionPlan };
  // Every requested side is planned above and assembled below, including cached
  // searches. An extra model analysis cannot add to this factual matrix and can
  // otherwise reject cached IDs that were not observed in the current run.
  return { plan: executionPlan, route, carePlanId: plan.id, continueOnToolFailure: true, allowModelFollowUps: false,
    taskLinks: Object.fromEntries(runnable.map((search) => [`${search.step.tool}:${search.step.input}`, plan.tasks.find((task) => task.key === search.key)!.id])),
    diagnostics: { workflow: 'comparison', primaryContexts: String(request.options.length), reusedSearches: runnable.length < searches.length, modelAttempts: '0', agentDepth: '1' },
    finalize: async (response, results) => {
      for (const search of runnable) {
        const task = plan.tasks.find((task) => task.key === search.key)!;
        const result = results.find((result) => result.tool === search.step.tool && result.input === search.step.input);
        const executed = response.tasks.find((task) => task.id === result?.taskId) ?? response.tasks.find((task) => task.id && task.objective === search.step.objective && task.tool === search.step.tool);
        task.status = executed?.status === 'completed' && result ? 'completed' : 'blocked';
        task.findings = task.status === 'completed' ? result!.result.findings : [];
        task.runId = response.runId; task.agentTaskId = executed?.id; task.updatedAt = new Date().toISOString();
        if (search.target && task.status === 'completed') task.discovery = discoveryMatch(task.findings, search.target);
      }
      const subjectTask = searches.find((search) => !search.target);
      const subjectFinding = subjectTask ? plan.tasks.find((task) => task.key === subjectTask.key)?.findings[0] : undefined;
      const groupFindings = searches.flatMap((search) => plan.tasks.find((task) => task.key === search.key)?.findings ?? []);
      let comparison;
      if (!question && !unsupported) {
        comparison = comparisonSchema.parse({ id: comparisonTask.comparison?.id ?? randomUUID(), request,
          sides: request.options.map((option, side) => {
            const groups = searches.filter((search) => search.side === side).map((search) => planningResultGroup(plan.tasks.find((task) => task.key === search.key)!)!);
            return { option, groups, missingFields: missingFields(groups) };
          }), subjectFinding, sources: [...new Map(groupFindings.map((finding) => [finding.provenance.recordId, finding.provenance])).values()],
          limitations: ['Catalog records do not establish clinical quality, outcomes, suitability, or current availability.',
            'Listed sample package prices are not provider quotes; inclusions, exclusions and dates may differ.',
            ...(groupFindings.some((finding) => finding.provenance.sourceKind === 'synthetic') ? ['Synthetic records are demo data, including all synthetic sample prices.'] : []),
            ...(request.budget?.currency === 'INR' ? ['The INR budget is saved; USD prices have not been converted or filtered by it.'] : [])], createdAt: new Date().toISOString() });
      }
      const related = unsupported ? groupFindings.map((finding) => ({ ...finding, matchType: 'related' as const,
        matchReason: 'A broader catalog topic only; no provider comparison confirms the requested procedure.' })) : [];
      comparisonTask.comparison = comparison; comparisonTask.findings = comparison ? unique(groupFindings) : related;
      comparisonTask.status = question ? 'awaiting_user' : response.status === 'failed' ? 'blocked' : 'completed';
      comparisonTask.runId = response.runId; comparisonTask.updatedAt = new Date().toISOString();
      if (review) {
        const hasOptions = comparison?.sides.some((side) => side.groups.some((group) => group.findings.length));
        if (!hasOptions) { review.status = 'blocked'; review.description = 'No matching option records are available to review. Adjust the comparison criteria.'; }
        else if (review.status === 'blocked') { review.status = 'pending'; review.description = ''; }
      }
      plan.findings = unique(plan.tasks.filter((task) => task.status === 'completed').flatMap((task) => task.findings));
      plan.status = active?.status === 'cancelled' ? 'cancelled' : derivePlanStatus(plan.tasks, plan.findings.length > 0);
      plan.updatedAt = new Date().toISOString(); const saved = await store.save(plan, lease);
      const nextSteps = question ? [question] : unsupported ? ['Try a supported catalog procedure as a separate comparison.'] : ['Review the sourced records, missing fields and package terms before deciding.', 'A clinician must assess medical suitability.'];
      return { ...response, discovery: undefined, resultGroups: undefined, comparison, plan: saved,
        findings: comparison ? unique(groupFindings) : related, question, questions: question ? [question] : [], nextSteps, nextActions: nextSteps,
        sources: (comparison ? unique(groupFindings) : related).map((finding) => finding.provenance),
        type: question ? 'clarification' : unsupported ? 'result' : 'comparison',
        status: question ? 'awaiting_user_input' : response.status,
        summary: question ? 'Your comparison request is saved. I need one detail before searching both options.'
          : unsupported ? `No exact catalog treatment matches “${subject!.value}”. No hospitals or packages have been compared for that procedure. Related catalog topics, if available, are shown separately.`
            : comparisonSummary(comparison!) };
    } };
}
