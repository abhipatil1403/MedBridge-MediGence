import { createHash, randomUUID } from 'node:crypto';
import type { CatalogSnapshot } from '@/types/catalog';
import { QueryNormalizer } from '@/lib/discovery/query-normalizer';
import { EntityMatcher } from '@/lib/discovery/entity-matcher';
import { carePlanSchema, type AgentPlan, type AgentTaskView, type CarePlan, type CarePlanTask, type ComparisonRequest, type Finding, type PlanningResultGroup, type ToolResult } from '@/lib/agents/schemas';
import type { RuntimeContext } from '@/lib/agents/runtime';
import { toolSchemas, toFinding } from '@/lib/agents/tools';
import { normalize } from '@/lib/discovery/normalize';
import { upsertTask, derivePlanStatus } from '@/lib/agents/treatment-planning/tasks';
import { discoveryMatch } from '@/lib/agents/treatment-planning/results';
import type { PlanningStore } from '@/lib/agents/treatment-planning/store';
import { evaluateFindings } from '@/lib/requirements/response';
import { compareCandidates } from '@/lib/agents/comparison/candidates';
import { associatePackages, compoundContext } from './ContextMerger';
import { compoundRequestSchema, type CompoundRequest, type OperationType } from './CompoundRequest';
import { HospitalMatchingAgent, needsLinkedPackages, hospitalMatchSummary } from '@/lib/agents/HospitalMatchingAgent';
import { planOperations } from './OperationPlanner';

type Search = { step: AgentPlan['steps'][number]; task: CarePlanTask; operation: OperationType; place: string };
type Results = Array<{ tool: string; input?: string; taskId?: string; result: ToolResult }>;
const unique = (findings: Finding[]) => [...new Map(findings.map((f) => [f.provenance.recordId, f])).values()].slice(0, 30);
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);

/** Prepares one existing runtime, with a single bounded dependent search batch. */
export async function prepareCompoundExecution(input: { content: string; request: CompoundRequest; userId: string; conversationId: string;
  snapshot: CatalogSnapshot; active?: CarePlan; caseContext?: Record<string, unknown>; store: PlanningStore; lease: string }): Promise<NonNullable<RuntimeContext['execution']>> {
  const { snapshot, store, lease } = input;
  const request = compoundRequestSchema.parse(structuredClone(input.request));
  const hospitalInput = request.operations.some((o) => o.type === 'discover_hospitals')
    ? { requirements: request.requirements, requestedOperations: request.operations.map((o) => o.type) } : undefined;
  if (hospitalInput && needsLinkedPackages(hospitalInput) && !request.operations.some((o) => o.type === 'discover_packages'))
    request.operations = planOperations([...hospitalInput.requestedOperations, 'discover_packages']);
  if (hospitalInput && request.requirements.some((r) => r.type === 'service') && !request.operations.some((o) => o.type === 'discover_services'))
    request.operations = planOperations([...request.operations.map((o) => o.type), 'discover_services']);
  const context = compoundContext(input.content, request, snapshot, input.active, input.caseContext);
  const now = new Date().toISOString();
  const plan: CarePlan = input.active ? { ...input.active, context } : carePlanSchema.parse({ id: randomUUID(), userId: input.userId,
    conversationId: input.conversationId, title: `${context.treatmentName ?? context.specialty ?? 'Catalog'} plan`.slice(0, 160), goal: input.content,
    status: 'draft', context, tasks: [], findings: [], createdAt: now, updatedAt: now });
  const cancelled = input.active?.status === 'cancelled';
  const procedure = request.requirements.find((r) => r.type === 'procedure');
  const unsupported = Boolean(procedure && procedure.matchType !== 'exact');
  const places = request.requirements.find((r) => r.type === 'location')?.places ?? [];
  const scopes = places.length ? places : [{ type: 'city' as const, value: context.city ?? '', label: context.city ?? 'All catalog locations' }];
  const searches: Search[] = [];
  const taskLinks: Record<string, string> = {};
  let limitReached = false;
  let scheduledCalls = 0;
  const requestKey = digest({ requirements: request.requirements, operations: request.operations.map((o) => o.type) });
  const operationTasks = new Map(request.operations.map((op) => [op.id, upsertTask(plan.tasks, `compound_${requestKey}_${op.id}`, {
    title: op.type.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()), taskType: 'discovery', status: 'pending', findings: [],
    description: op.dependsOn.length ? `Depends on ${op.dependsOn.join(', ')}` : 'Independent catalog operation',
  })]));
  const addSearch = (operation: OperationType, place: typeof scopes[number], hospital?: Finding) => {
    const target = operation.replace('discover_', '') as 'hospitals' | 'packages' | 'doctors' | 'services';
    const tool = `search_${target}` as 'search_hospitals' | 'search_packages' | 'search_doctors' | 'search_services';
    const args = toolSchemas[tool].parse(target === 'services' ? { query: request.requirements.filter((r) => r.type === 'service').map((r) => r.label).join(' ').slice(0, 240) || 'Coordination services' }
      : { query: `Find ${target} for ${context.treatmentName ?? context.specialty ?? 'catalog records'}${place.value ? ` in ${place.label}` : ''}`.slice(0, 240),
      treatment: context.treatmentSlug, specialty: operation === 'discover_doctors' ? context.specialty
        : operation === 'discover_hospitals' ? request.requirements.find((r) => r.type === 'specialty')?.value : undefined,
      city: place.type === 'city' ? place.value || undefined : undefined,
      country: place.type === 'country' ? place.value : place.value ? EntityMatcher.match(place.label, snapshot).country : context.country,
      hospital: hospital?.slug ?? context.preferredHospital });
    const step = { tool, objective: `Find ${target}${hospital ? ` for ${hospital.title}` : place.value ? ` in ${place.label}` : ''}`.slice(0, 160), input: JSON.stringify(args) };
    const catalogSignature = digest({ records: [...snapshot[target]].sort((a, b) => a.recordId.localeCompare(b.recordId)),
      hospitals: target === 'packages' ? [...snapshot.hospitals].sort((a, b) => a.recordId.localeCompare(b.recordId)) : undefined,
      filters: args });
    const cached = plan.tasks.find((t) => t.tool === tool && t.input === step.input && t.status === 'completed' && t.catalogSignature === catalogSignature
      && t.findings.every((f) => snapshot[target].some((r) => {
        if (r.recordId !== f.provenance.recordId || r.slug !== f.slug) return false;
        const linkedHospital = 'hospitalSlug' in r ? snapshot.hospitals.find((h) => h.slug === r.hospitalSlug) : undefined;
        const city = 'city' in r ? r.city : linkedHospital?.city;
        return (!args.hospital || ('hospitalSlug' in r ? r.hospitalSlug : r.slug) === args.hospital)
          && (!args.treatment || ('treatmentSlug' in r ? r.treatmentSlug === args.treatment : 'treatmentSlugs' in r && r.treatmentSlugs.includes(args.treatment)))
          && (!args.city || normalize(city ?? '') === normalize(args.city))
          && (!args.country || 'country' in r && r.country === args.country)
          && (!args.specialty || 'specialty' in r && normalize(r.specialty) === normalize(args.specialty)
            || 'specialties' in r && r.specialties.some((value) => normalize(value) === normalize(args.specialty!)));
      })));
    if (searches.some((s) => s.step.tool === tool && s.step.input === step.input)) return;
    if (!cached && scheduledCalls >= 8) { limitReached = true; return; }
    if (!cached) scheduledCalls++;
    const task = cached ?? upsertTask(plan.tasks, `compound_search_${digest({ tool, args })}`, { title: step.objective,
      taskType: 'discovery', tool, input: step.input, catalogSignature, status: 'in_progress', findings: [] });
    if (cached) cached.findings = cached.findings.flatMap((finding) => {
      const record = snapshot[target].find((r) => r.recordId === finding.provenance.recordId && r.slug === finding.slug);
      return record ? [toFinding(target, record, finding.matchType, finding.matchReason)] : [];
    });
    searches.push({ step, task, operation, place: place.value }); taskLinks[`${tool}:${step.input}`] = task.id;
  };
  if (!request.requiresClarification && !unsupported && !cancelled) for (const op of request.operations) {
    if (op.scope === 'independent' && op.type.startsWith('discover_')) for (const place of op.type === 'discover_services' ? scopes.slice(0, 1) : scopes) addSearch(op.type, place);
  }
  const sync = (results: Results, executed: AgentTaskView[], runId?: string) => {
    for (const search of searches) {
      if (search.task.status === 'completed') {
        if (runId && executed.some((t) => t.id === search.task.agentTaskId)) search.task.runId = runId;
        search.task.findings = evaluateFindings(associatePackages(search.task.findings, snapshot), request.requirements, snapshot); continue;
      }
      const result = results.find((r) => r.tool === search.step.tool && r.input === search.step.input);
      const runtimeTask = executed.find((t) => t.id === result?.taskId) ?? executed.find((t) => t.objective === search.step.objective && t.tool === search.step.tool);
      if (!runtimeTask) continue;
      search.task.status = runtimeTask.status === 'completed' && result ? 'completed' : 'blocked';
      search.task.findings = result ? evaluateFindings(associatePackages(result.result.findings, snapshot), request.requirements, snapshot) : [];
      search.task.runId = runId; search.task.agentTaskId = runtimeTask.id; search.task.updatedAt = new Date().toISOString();
      if (search.task.status === 'completed') search.task.discovery = discoveryMatch(search.task.findings, search.operation.replace('discover_', '') as PlanningResultGroup['target']);
    }
  };
  const linkPackages = () => {
    const packageOp = request.operations.find((o) => o.type === 'discover_packages' && o.scope === 'linked_hospitals');
    if (!packageOp) return;
    for (const search of searches.filter((s) => s.operation === 'discover_hospitals' && s.task.status === 'completed')) {
      const place = scopes.find((p) => p.value === search.place)!;
      for (const finding of search.task.findings) if (finding.matchType === 'exact'
        && snapshot.hospitals.some((h) => h.recordId === finding.provenance.recordId && h.slug === finding.slug)) addSearch('discover_packages', place, finding);
    }
  };
  // Cached hospital findings can drive the dependent batch immediately.
  linkPackages();
  const runnable = searches.filter((s) => s.task.status !== 'completed').map((s) => s.step);
  plan.status = cancelled ? 'cancelled' : 'planning'; plan.updatedAt = now;
  await store.save(plan, lease);
  const labels = { discover_hospitals: 'hospital search', discover_doctors: 'doctor search', discover_packages: 'package search', discover_services: 'general service catalog search (hospital availability unconfirmed)', evaluate_requirements: 'requirement checks', compare_results: 'catalog comparison' };
  const understanding = `You're looking for ${context.treatmentName ?? context.specialty ?? 'catalog options'}${places.length ? ` in ${places.map((p) => p.label).join(' or ')}` : ''}${context.budget ? ` with a ${context.budget.currency} ${context.budget.amount.toLocaleString('en-US')} budget` : ''}. You requested ${request.operations.map((o) => labels[o.type]).join(', ')}.`.slice(0, 400);
  const executionPlan: AgentPlan = { agent: hospitalInput && !request.operations.some((o) => o.type === 'discover_doctors') ? 'hospital_matching' : 'treatment_planning', understanding, steps: runnable, missingInformation: request.clarification?.question ?? null };
  const normalized = QueryNormalizer.normalize('Catalog options', snapshot); normalized.missingEntities = [];
  return { plan: executionPlan, route: { plan: executionPlan, snapshot, normalized }, carePlanId: plan.id, taskLinks, continueOnToolFailure: true,
    diagnostics: { workflow: 'compound', modelAttempts: '0', agentDepth: '1', reusedSearches: searches.some((s) => s.task.status === 'completed') },
    nextSteps: async (results, tasks) => {
      sync(results, tasks); linkPackages(); await store.save(plan, lease);
      return searches.filter((s) => s.task.status === 'in_progress' && !tasks.some((t) => t.objective === s.step.objective && t.tool === s.step.tool)).map((s) => s.step);
    },
    finalize: async (response, results) => {
      sync(results, response.tasks, response.runId);
      for (const search of searches) if (search.task.status === 'in_progress') search.task.status = 'blocked';
      const groupsFor = (place?: string): PlanningResultGroup[] => request.operations.filter((o) => o.type.startsWith('discover_')).map((op) => {
        const selected = searches.filter((s) => s.operation === op.type && (place === undefined || s.place === place));
        const findings = unique(selected.flatMap((s) => s.task.findings));
        const target = op.type.replace('discover_', '') as PlanningResultGroup['target'];
        const blocked = selected.some((s) => s.task.status !== 'completed') || op.type === 'discover_packages' && limitReached;
        // A blocked aggregate may still have successful records. Keep those records in a completed group and expose incompleteness in operation metadata.
        return { taskId: operationTasks.get(op.id)!.id, target, findings, status: blocked && !findings.length ? 'blocked' : 'completed',
          ...discoveryMatch(findings, target), ...(blocked ? { matchReason: 'Some catalog searches could not finish; successful sourced records are preserved.' } : {}) };
      });
      const groups = groupsFor(); let findings = unique(groups.flatMap((g) => g.findings));
      for (const op of request.operations.filter((o) => o.type.startsWith('discover_'))) {
        const selected = searches.filter((s) => s.operation === op.id);
        op.status = selected.some((s) => s.task.status !== 'completed') || op.type === 'discover_packages' && limitReached ? 'incomplete'
          : !selected.length && op.scope === 'linked_hospitals' ? 'skipped' : 'completed';
        op.note = op.status === 'skipped' ? 'No verified hospital candidates were available for a linked package search.'
          : op.status === 'incomplete' ? 'The search is incomplete; successful records remain available.' : `${unique(selected.flatMap((s) => s.task.findings)).length} sourced records found.`;
      }
      const evaluation = request.operations.find((o) => o.type === 'evaluate_requirements');
      if (evaluation) { evaluation.status = findings.length ? 'completed' : 'skipped'; evaluation.note = 'Each returned record is evaluated independently against the shared requirements.'; }
      const hospitalMatches = hospitalInput ? HospitalMatchingAgent.match({ ...hospitalInput, requestedOperations: request.operations.map((o) => o.type) },
        groups.filter((g) => g.target === 'hospitals').flatMap((g) => g.findings), groups.filter((g) => g.target === 'packages').flatMap((g) => g.findings), snapshot,
        new Map(findings.filter((f) => f.kind === 'hospitals').map((hospital) => [hospital.provenance.recordId,
          !needsLinkedPackages({ ...hospitalInput, requestedOperations: request.operations.map((o) => o.type) }) || !limitReached && searches.some((s) =>
            s.operation === 'discover_packages' && JSON.parse(s.step.input).hospital === hospital.slug && s.task.status === 'completed') ]))) : undefined;
      const orderedIds = hospitalMatches?.flatMap((m) => [m.hospital.provenance.recordId, ...m.linkedPackages.map((p) => p.package.provenance.recordId)]) ?? [];
      const order = (items: Finding[]) => orderedIds.length ? items.sort((a, b) => {
        const x = orderedIds.indexOf(a.provenance.recordId), y = orderedIds.indexOf(b.provenance.recordId);
        return (x < 0 ? 99 : x) - (y < 0 ? 99 : y);
      }) : items;
      for (const group of groups) order(group.findings);
      findings = unique(groups.flatMap((g) => g.findings));
      const comparisonOp = request.operations.find((o) => o.type === 'compare_results');
      let comparison; let comparisonText = '';
      if (comparisonOp) {
        const targets = context.requestedTargets.filter((t): t is ComparisonRequest['targets'][number] => t !== 'services');
        const comparisonRequest: ComparisonRequest = { intent: 'comparison', options: places.slice(0, 2), targets, budget: context.budget,
          requirements: request.requirements, focus: 'catalog', subject: context.treatmentSlug ? { type: 'treatment', value: context.treatmentName!, slug: context.treatmentSlug, matchType: 'exact' }
            : context.specialty ? { type: 'specialty', value: context.specialty, matchType: 'exact' } : undefined };
        const dataUnavailable = request.operations.some((o) => o.type.startsWith('discover_') && ['incomplete', 'skipped'].includes(o.status));
        if (dataUnavailable || !findings.length || request.requiresClarification || unsupported || cancelled) {
          comparisonOp.status = 'skipped'; comparisonOp.note = 'Comparison was not executed because the requested candidate data was unavailable or incomplete.';
          comparisonText = comparisonOp.note;
        } else {
          const result = compareCandidates(comparisonRequest, places.length === 2 ? places.map((p) => groupsFor(p.value).filter((g) => g.target !== 'services').map((g) => ({ ...g, findings: order(g.findings) }))) : [groups.filter((g) => g.target !== 'services')]);
          comparison = result.comparison; comparisonText = result.summary; comparisonOp.status = result.complete ? 'completed' : 'incomplete'; comparisonOp.note = result.summary.slice(0, 600);
        }
      }
      if (comparison && hospitalMatches) {
        const displayed = comparison.sides.flatMap((s) => s.groups.filter((g) => g.target === 'hospitals').flatMap((g) => g.findings.map((f) => f.provenance.recordId)));
        hospitalMatches.sort((a, b) => displayed.indexOf(a.hospital.provenance.recordId) - displayed.indexOf(b.hospital.provenance.recordId));
      }
      const question = cancelled || unsupported ? null : request.clarification?.question ?? null;
      if (question || unsupported || cancelled) for (const op of request.operations) { op.status = 'skipped'; op.note = cancelled ? 'The saved plan is cancelled.' : unsupported ? 'The procedure has no exact catalog match.' : 'Waiting for the missing requirement.'; }
      for (const op of request.operations) {
        const task = operationTasks.get(op.id)!; task.status = question ? 'awaiting_user' : op.status === 'completed' ? 'completed' : 'blocked';
        task.description = op.note ?? ''; task.runId = response.runId; task.updatedAt = new Date().toISOString();
        task.findings = groups.find((g) => `discover_${g.target}` === op.type)?.findings ?? (op.type === 'compare_results' ? findings : []);
        if (op.type === 'compare_results') { task.comparison = comparison; task.comparisonRequest = comparison?.request; }
        if (op.type === 'discover_hospitals') task.hospitalMatches = hospitalMatches;
      }
      plan.context.compoundRequest = compoundRequestSchema.parse(request);
      plan.findings = unique(plan.tasks.filter((t) => t.status === 'completed').flatMap((t) => t.findings));
      plan.status = cancelled ? 'cancelled' : derivePlanStatus(plan.tasks, plan.findings.length > 0); plan.updatedAt = new Date().toISOString();
      const saved = await store.save(plan, lease);
      const gaps = [...new Map(findings.flatMap((f) => f.requirementEvaluation?.evaluations ?? []).filter((e) => !['exact', 'not_applicable'].includes(e.status)).map((e) => [e.requirementId, e])).values()];
      const checks = !findings.length ? 'No candidate evidence is available to confirm the requirements.'
        : gaps.length ? `Requirement gaps: ${gaps.map((g) => `${g.label}: ${g.status.replaceAll('_', ' ')}`).join('; ')}.` : 'All applicable requested criteria have supporting catalog evidence.';
      const summary = cancelled ? 'This coordination plan is cancelled. Start a new conversation for another goal.'
        : question ? 'Your requested operations are saved. I need the missing detail before searching.'
          : unsupported ? `No exact catalog match exists for ${procedure!.label}. No providers or packages have been claimed for this procedure.`
            : `${groups.map((g) => `${g.target}: ${g.findings.length} sourced record${g.findings.length === 1 ? '' : 's'}${g.status === 'blocked' ? '; search incomplete' : ''}.`).join(' ')} ${hospitalMatches ? hospitalMatchSummary(hospitalMatches) : checks} ${comparisonText} Listed sample prices are not quotes; demo records are not live provider information.`.slice(0, 1600);
      const nextSteps = question ? [question] : ['Review the sourced hospital and linked package details.',
        'Confirm undocumented features and current prices with the provider.', 'Search another destination or provider for additional comparison candidates.'];
      return { ...response, hospitalMatches, compoundRequest: request, understanding, summary, findings, resultGroups: comparison ? groups.filter((g) => g.target === 'services') : groups,
        comparison, plan: saved, discovery: undefined, question, questions: question ? [question] : [], nextSteps, nextActions: nextSteps,
        status: question ? 'awaiting_user_input' : findings.length || response.status !== 'failed' ? 'completed' : 'failed',
        type: question ? 'clarification' : 'planning', sources: findings.map((f) => f.provenance) };
    } };
}
