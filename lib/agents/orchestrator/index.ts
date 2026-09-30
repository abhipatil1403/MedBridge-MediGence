import { randomUUID } from 'node:crypto';
import { QueryNormalizer } from '@/lib/discovery/query-normalizer';
import { discoveryRoute, loadDiscoverySnapshot, routeToolDependencies } from '../discovery-routing';
import { AgentError } from '../errors';
import { runAgent, requestBoundary, safetyPlan, type RuntimeContext } from '../runtime';
import { assistantResponseSchema, userRequestSchema, type AgentResponse } from '../schemas';
import { defaultToolDependencies } from '../tools';
import { prepareTreatmentPlanning } from '../treatment-planning/agent';
import type { PlanningStore } from '../treatment-planning/store';
import { upsertTask } from '../treatment-planning/tasks';
import { classifyWorkflow } from './classifier';
import { prepareComparison } from '../comparison/agent';

export interface OrchestratorContext extends RuntimeContext { planningStore: PlanningStore }

/** One authenticated turn, one selected workflow, one bounded runtime. No recursive agent calls. */
export async function orchestrate(rawRequest: unknown, context: OrchestratorContext): Promise<AgentResponse> {
  context = { ...context, supportedAgents: ['discovery', 'treatment_planning', 'comparison'] };
  const request = userRequestSchema.parse(rawRequest);
  const caseContext = request.caseId ? await context.caseAccess.readContext(request.caseId) : undefined;
  const conversationId = request.conversationId ?? await context.store.createConversation(context.userId, request.caseId);
  await context.store.assertConversation(conversationId, context.userId, request.caseId);
  const lease = randomUUID();
  let hasPlanningSchema = true;
  try {
    if (!await context.planningStore.acquire(conversationId, context.userId, lease))
      throw new AgentError('TURN_IN_PROGRESS', 'This conversation is still working on a request. Please wait for it to finish.');
  } catch (error) {
    if (!(error instanceof AgentError) || error.code !== 'PLANNING_MIGRATION_MISSING') throw error;
    hasPlanningSchema = false;
  }
  try {
    const [active, recent] = await Promise.all([hasPlanningSchema ? context.planningStore.load(conversationId, context.userId) : undefined, context.planningStore.recentMessages(conversationId)]);
    const boundary = requestBoundary(request.content);
    if (boundary) {
      const guarded = safetyPlan(request.content);
      const boundaryPlan = boundary === 'external' && guarded ? guarded : { agent: 'discovery' as const,
        understanding: 'This request may need clinical assessment.', steps: [], missingInformation: null };
      let taskId: string | undefined;
      if (active && boundary === 'external' && guarded) {
        // Boundary only: no provider, booking, sharing, or payment integration exists.
        const key = `external_${JSON.parse(guarded.steps[0].input).action}`;
        const task = upsertTask(active.tasks, key, { title: 'External action needs confirmation and a future integration', taskType: 'external_action',
          description: 'No external action has been performed.', requiresUserAction: true, requiresApproval: true,
          approvalStatus: 'pending', status: 'awaiting_user' });
        taskId = task.id;
        active.status = 'awaiting_user';
        await context.planningStore.save(active, lease);
      }
      return validateResponse(await runAgent({ ...request, conversationId }, { ...context, execution: {
        plan: boundaryPlan, carePlanId: active?.id,
        taskLinks: taskId && guarded ? { [`${guarded.steps[0].tool}:${guarded.steps[0].input}`]: taskId } : undefined,
        finalize: async (response) => {
          if (active && taskId) {
            const task = active.tasks.find((item) => item.id === taskId)!;
            task.runId = response.runId; task.agentTaskId = response.tasks[0]?.id;
            task.updatedAt = new Date().toISOString(); active.updatedAt = task.updatedAt;
            await context.planningStore.save(active, lease);
          }
          return { ...response, type: response.status === 'awaiting_approval' ? 'progress' : 'result', plan: active };
        },
      } }));
    }
    const snapshot = await loadDiscoverySnapshot(context.tools?.repository ?? defaultToolDependencies.repository);
    const goalText = request.content.split(/[.!?]/)[0].replace(/\s+treatment(?=\s+(?:in|at|near)\b|$)/i, '');
    let normalized = QueryNormalizer.normalize(goalText, snapshot);
    let content = request.content;
    // Resolve the answer to the most recent targeted discovery clarification.
    const lastAssistant = [...recent].reverse().find((message) => message.role === 'assistant');
    if (!active && !normalized.targets.length && normalized.entities.procedure && lastAssistant && /specific procedure|surgery or procedure|treatment.*packages/i.test(lastAssistant.content)) {
      const previousUser = [...recent].reverse().find((message) => message.role === 'user');
      const target = previousUser && /packages?/i.test(previousUser.content) ? 'packages' : 'hospitals';
      content = `Find ${target} for ${request.content}`;
      normalized = QueryNormalizer.normalize(content, snapshot);
    }
    const decision = classifyWorkflow(content, normalized, active);
    if (decision.workflow === 'comparison') {
      if (!hasPlanningSchema) throw new AgentError('PLANNING_MIGRATION_MISSING', 'Saved comparisons need the care-plan migration before they can run.');
      const execution = await prepareComparison({ content: request.content, snapshot, active, userId: context.userId, conversationId,
        store: context.planningStore, lease, tools: context.tools ?? defaultToolDependencies });
      return validateResponse(await runAgent({ ...request, conversationId }, { ...context, execution }));
    }
    const unsupported = normalized.entities.procedurePhrase && ['related', 'none'].includes(normalized.entities.procedureMatchType);
    if (decision.workflow === 'treatment_planning' && !unsupported) {
      if (!hasPlanningSchema) throw new AgentError('PLANNING_MIGRATION_MISSING', 'Care planning needs its database migration before it can run. Catalog discovery is still available.');
      const execution = await prepareTreatmentPlanning({ content: request.content, snapshot, active, caseContext,
        userId: context.userId, conversationId, store: context.planningStore, lease, provider: context.provider,
        tools: context.tools ?? defaultToolDependencies });
      return validateResponse(await runAgent({ ...request, conversationId }, { ...context, execution }));
    }
    const tempRoute = { snapshot, normalized, plan: { agent: 'discovery' as const, understanding: 'Search the catalog.', steps: [], missingInformation: null } };
    const tools = routeToolDependencies(tempRoute, context.tools ?? defaultToolDependencies);
    let route = await discoveryRoute(content, tools.repository);
    if (decision.reason === 'missing_context') route = { ...tempRoute, plan: { agent: 'discovery',
      understanding: 'You are looking for treatment packages.', steps: [], missingInformation: 'What treatment are you looking for packages for?' } };
    if (route && decision.reason === 'missing_context') route.normalized.missingEntities = ['procedure'];
    const response = await runAgent({ ...request, content, conversationId }, { ...context, tools,
      // Keep legacy non-discovery tool workflows outside the new planning route.
      ...(decision.reason === 'missing_context' && route ? { execution: { plan: route.plan, route } } : {}),
    });
    return validateResponse({ ...response, type: response.status === 'failed' ? 'error' : response.question ? 'clarification' : 'discovery' });
  } finally { if (hasPlanningSchema) await context.planningStore.release(conversationId, lease); }
}

export function validateResponse(response: AgentResponse): AgentResponse {
  return assistantResponseSchema.parse({ ...response, questions: response.questions ?? (response.question ? [response.question] : []),
    nextActions: response.nextActions ?? response.nextSteps, sources: response.sources ?? response.findings.map((finding) => finding.provenance) });
}
