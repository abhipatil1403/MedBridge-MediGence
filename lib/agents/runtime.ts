import type { LLMProvider } from '@/lib/ai/contracts';
import { ZodError } from 'zod';
import { AgentError } from './errors';
import { discoveryRoute, routeToolDependencies, type DiscoveryRoute } from './discovery-routing';
import { agents } from './registry';
import { assistantResponseSchema, discoveryResultSchema, planSchema, synthesisSchema, toolResultSchema, userRequestSchema, type AgentId, type AgentPlan, type AgentResponse, type AgentTaskView, type Finding, type ToolResult } from './schemas';
import { toolRegistry, type CaseAccess, type ToolDependencies, defaultToolDependencies, toolDescriptions, toolSchemas } from './tools';
import type { AgentStore } from './persistence';
import { attachReferences } from '@/lib/conversation/context';
import type { ValidatedConversationContext } from '@/lib/conversation/context';
import { ReferenceDetector } from '@/lib/conversation/ReferenceDetector';

import { AGENT_LIMITS, ExecutionState, terminalStates, canonicalInput, safeText, safeValue } from './execution-state';
import { executeRegisteredTool } from './tool-execution';
import { observeNext } from './observation';
export { AGENT_LIMITS } from './execution-state';
const clinicalPattern = /\b(chest pain|chest hurts|can't breathe|cannot breathe|stroke symptoms|suicid|diagnose|what disease|prescribe|prescription)\b/i;
const externalPatterns: Array<[RegExp, 'share_records' | 'booking' | 'payment' | 'travel_purchase' | 'visa_submission']> = [
  [/\b(send|share|forward|submit|email)\b.*\b(medical|report|record|document|scan|test result)s?\b/i, 'share_records'],
  [/\b(book|schedule)\b.*\b(appointment|consultation|hospital|doctor)\b/i, 'booking'],
  [/\b(pay|payment|transfer money)\b/i, 'payment'],
  [/\b(buy|purchase|book)\b.*\b(flight|hotel|travel)\b/i, 'travel_purchase'],
  [/\b(submit|file)\b.*\bvisa\b/i, 'visa_submission'],
];

export interface RuntimeContext {
  conversation?: ValidatedConversationContext;
  userId: string;
  caseAccess: CaseAccess;
  store: AgentStore;
  provider: LLMProvider;
  tools?: ToolDependencies;
  supportedAgents?: readonly AgentId[];
  finalizeResponse?: (response: AgentResponse) => Promise<AgentResponse>;
  execution?: {
    verificationAuthorization?: import('@/lib/verification/service').VerificationAuthorization;
    documentAuthorization?: import('@/lib/documents/service').DocumentAuthorization;
    researchAuthorization?: import('@/lib/research/schemas').ResearchAuthorization;
    referenceBoundary?: ToolContextReferenceBoundary;
    plan: AgentPlan; route?: DiscoveryRoute; carePlanId?: string;
    messageSourceId?: string;
    synthesis?: { summary: string; nextSteps: string[]; question: string | null };
    taskLinks?: Record<string, string>;
    diagnostics?: Record<string, string | boolean | null>;
    continueOnToolFailure?: boolean;
    /** Server-planned workflows may finish through their deterministic aggregator. */
    allowModelFollowUps?: boolean;
    nextSteps?: (results: Array<{ tool: string; input?: string; taskId?: string; result: ToolResult }>, tasks: AgentTaskView[]) => Promise<AgentPlan['steps']>;
    finalize?: (response: AgentResponse, results: Array<{ tool: string; input?: string; taskId?: string; result: ToolResult }>) => Promise<AgentResponse>;
  };
}
export interface ToolContextReferenceBoundary {
  status: 'resolved' | 'ambiguous' | 'unresolved';
  allowedCalls: Array<{ tool: string; input: unknown }>;
}

export function requestBoundary(content: string): 'clinical' | 'external' | undefined {
  if (/\b(?:is|would)\b.*\b(?:surgery|treatment|replacement)\b.*\b(?:necessary|appropriate|suitable)\b|\bdo I need (?:a |an )?(?:knee|hip) replacement\b|\bshould I\b.*\b(?:medication|medicine|dose|surgery|replacement)\b/i.test(content)) return 'clinical';
  if (clinicalPattern.test(content) || /\b(should i (?:have|undergo)|do i need (?:surgery|treatment)|best treatment|medically appropriate|what medication|(?:what|which|give me|tell me)\b.*\bdiagnosis|interpret\b.*\b(?:MRI|scan|imaging)|should i\b.*\b(?:take|stop|change)\b)\b/i.test(content)) return 'clinical';
  return externalPatterns.some(([pattern]) => pattern.test(content)) ? 'external' : undefined;
}

function publicFailure(error: unknown): AgentError {
  return error instanceof AgentError ? error : new AgentError('AGENT_FAILURE', 'The assistant could not complete this request. Please try again.', error);
}

function validateSynthesis(summary: string, nextSteps: readonly string[], question: string | null) {
  const text = [summary, ...nextSteps, question ?? ''].join(' ');
  if (safeText(text) !== text) throw new AgentError('UNSAFE_MODEL_OUTPUT', 'The assistant could not prepare a reliable summary.');
  if (/\b(you have|you need surgery|best hospital|safest hospital|guaranteed outcome|confirmed booking|success rate|booked|reserved|paid|emailed|submitted|scheduled|verified credentials)\b|[$₹]/i.test(text)) {
    throw new AgentError('UNSAFE_MODEL_OUTPUT', 'The assistant could not prepare a reliable summary. Please try again.');
  }
}

export function safetyPlan(content: string): AgentPlan | undefined {
  const external = externalPatterns.find(([pattern]) => pattern.test(content));
  if (external) return { agent: 'treatment_planning', understanding: 'You requested an action involving an external service.',
    steps: [{ objective: 'Record this action for human review', tool: 'request_external_action', input: JSON.stringify({ action: external[1] }) }], missingInformation: null };
  return undefined;
}

async function planRequest(provider: LLMProvider, content: string, caseContext?: Record<string, unknown>,
  followUp?: { agent: AgentPlan['agent']; findings: Finding[]; usedTools: string[] }, onValidationError?: (failure: AgentError) => void, supportedAgents?: readonly AgentId[], conversation?: ValidatedConversationContext): Promise<AgentPlan> {
  const definitions = Object.values(agents).filter((agent) => !supportedAgents || supportedAgents.includes(agent.id)).map(({ id, purpose, allowedTools, safety }) => ({ id, purpose, allowedTools, safety }));
  const system = `You are MedBridge's non-clinical care coordination planner. Select one agent and up to ${AGENT_LIMITS.maxToolCalls} allowed tools. Never invent catalog entities or treat a related procedure as an exact match. A hospital offers a procedure only when a tool confirms an explicit treatment link. Do not ask for a locality when a city is supplied, or for a budget unless required. Ask only for genuinely missing information. Never diagnose, prescribe, invent prices or availability, or expose tool errors. The catalog contains synthetic/demo records. ${followUp ? `This is iteration two. Keep agent ${followUp.agent}; use only needed new tools with returned slugs.` : ''} Agent definitions: ${JSON.stringify(definitions)}. Tool descriptions: ${JSON.stringify(toolDescriptions)}. Tool input JSON schemas: ${JSON.stringify(Object.fromEntries(Object.entries(toolSchemas).map(([name, schema]) => [name, schema.toJSONSchema()])))}.`;
  let lastError: unknown;
  for (let attempt = 0; attempt < AGENT_LIMITS.maxPlanningAttempts; attempt++) {
    try {
      const raw = await provider.generateStructured({ purpose: 'plan', system,
        input: JSON.stringify({ request: safeText(content), conversation: conversation ? safeValue(conversation) : undefined, caseContext: caseContext ?? null,
          previousResults: followUp ? { agent: followUp.agent, usedTools: followUp.usedTools,
            findings: followUp.findings.map(({ kind, slug, title, facts }) => ({ kind, slug, title, facts })) } : undefined,
          correction: attempt ? 'Previous plan was invalid. Use only tools allowed for the selected agent and valid inputs.' : undefined }),
        schema: planSchema, maxOutputTokens: 1300, timeoutMs: AGENT_LIMITS.modelTimeoutMs });
      const parsed = planSchema.safeParse(raw);
      if (!parsed.success) throw new AgentError('PLAN_SCHEMA_INVALID', 'The assistant could not prepare a reliable search.',
        parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.code}`).join(','));
      const generated = parsed.data;
      if (supportedAgents && !supportedAgents.includes(generated.agent)) throw new AgentError('PLAN_TOOL_DENIED', 'This workflow is not available.');
      // The selected agent is fixed for a run. A later model turn may suggest a
      // different specialist, but only the original agent's allowlist can execute.
      const hasCatalogRead = generated.steps.some((step) => step.tool.startsWith('search_') || step.tool.startsWith('get_'));
      const steps = hasCatalogRead ? generated.steps.filter((step) => step.tool !== 'request_user_information') : generated.steps;
      const plan = followUp ? { ...generated, agent: followUp.agent, steps } : { ...generated, steps };
      if (plan.steps.some((step) => !agents[plan.agent].allowedTools.includes(step.tool))) throw new AgentError('PLAN_TOOL_DENIED', 'The assistant selected an unavailable action.');
      for (const step of plan.steps) {
        let input: unknown;
        try { input = JSON.parse(step.input); } catch { throw new AgentError('PLAN_INPUT_INVALID', 'The assistant could not prepare a reliable search.', `${step.tool}:invalid_json`); }
        const validated = toolSchemas[step.tool].safeParse(input);
        if (!validated.success) throw new AgentError('PLAN_INPUT_INVALID', 'The assistant could not prepare a reliable search.',
          `${step.tool}:${validated.error.issues.map((issue) => `${issue.path.join('.')}:${issue.code}`).join(',')}`);
      }
      return plan;
    } catch (error) {
      lastError = error;
      if (error instanceof AgentError && error.code.startsWith('PLAN_')) onValidationError?.(error);
      if (error instanceof AgentError && ['MODEL_AUTH_FAILURE', 'MODEL_RATE_LIMIT', 'MODEL_TIMEOUT', 'MODEL_UNAVAILABLE'].includes(error.code)) break;
    }
  }
  throw lastError instanceof ZodError ? new AgentError('PLAN_SCHEMA_INVALID', 'The assistant could not prepare a reliable search.') : publicFailure(lastError);
}

function discoverySummary(route: DiscoveryRoute, findings: readonly Finding[]) {
  const { entities, missingEntities } = route.normalized;
  if (missingEntities.length) return { summary: 'I need the specific procedure before searching hospital options.',
    nextSteps: ['Tell me the surgery or procedure you want to explore.'] };
  if (entities.procedurePhrase && ['related', 'none'].includes(entities.procedureMatchType)) {
    return { summary: `I couldn't find an exact catalog match for “${entities.procedurePhrase}”. I won't list hospitals or packages as providers of that procedure.`,
      nextSteps: ['Try a broader catalog term as a separate search, or ask a clinician which procedure name to use.'] };
  }
  if (!findings.length) {
    const subject = route.normalized.targets.includes('doctors') && entities.specialty
      ? `${entities.specialty.toLowerCase()} doctors` : route.normalized.targets.join(' or ') || 'catalog records';
    const place = entities.city ? ` in ${entities.city}` : entities.country ? ` in ${entities.country}` : '';
    return { summary: `I couldn't find ${subject}${place} that meet your criteria in the current MedBridge catalog. No provider has been shown as a match.`,
    nextSteps: ['Try a broader location or treatment term.'] };
  }
  const demo = findings.some((item) => item.provenance.sourceKind === 'synthetic');
  return { summary: `I found ${findings.length} catalog ${findings.length === 1 ? 'record' : 'records'} matching your stated criteria.${demo ? ' Demo records are not live provider information.' : ''}`,
    nextSteps: ['Review the sourced records and their exact match reasons.'] };
}

export async function runAgent(rawRequest: unknown, context: RuntimeContext): Promise<AgentResponse> {
  const request = userRequestSchema.parse(rawRequest);
  let caseContext: Record<string, unknown> | undefined;
  if (request.caseId && context.execution?.diagnostics?.workflow !== 'document_coordination') caseContext = await context.caseAccess.readContext(request.caseId);
  const conversationId = request.conversationId ?? await context.store.createConversation(context.userId, request.caseId);
  if (request.conversationId) await context.store.assertConversation(conversationId, context.userId, request.caseId);
  await context.store.addMessage(conversationId, 'user', safeText(request.content), undefined,
    context.execution?.messageSourceId ? { sourceId: context.execution.messageSourceId } : {});

  const clinical = requestBoundary(request.content) === 'clinical';
  let route: DiscoveryRoute | undefined;
  const diagnostics: Record<string, string | boolean | null> = { ...context.execution?.diagnostics };
  let plan: AgentPlan;
  const runId = await context.store.startRun(conversationId, context.userId, context.execution?.plan.agent ?? 'discovery', request.caseId, context.execution?.carePlanId);
  const execution = new ExecutionState(runId, conversationId, context.userId, request.content, 'Understand the catalog request', context.store);
  execution.agent = context.execution?.plan.agent ?? 'discovery';
  execution.conversation = context.conversation;
  await execution.persist();
  await execution.transition('planning');
  try {
    const requiresReference = ReferenceDetector.detect(request.content)?.entityType !== 'case' && Boolean(ReferenceDetector.detect(request.content))
      || Boolean(context.conversation?.pendingClarification && /^(yes|no|ok|okay|sure|go ahead)[.!?]*$/i.test(request.content.trim()));
    if (requiresReference && !context.execution?.referenceBoundary && !clinical && !context.execution?.diagnostics?.workflow?.toString().startsWith('reference') && !context.execution?.messageSourceId) {
      plan = { agent: 'discovery', understanding: 'Identify the previously shown result before continuing.', steps: [], missingInformation: 'Which sourced result do you mean? Specify its type, name or position.' };
      context = { ...context, execution: { plan, synthesis: { summary: plan.missingInformation!, question: plan.missingInformation, nextSteps: [] }, referenceBoundary: { status: 'unresolved', allowedCalls: [] } } };
    } else if (context.execution && !clinical) { plan = planSchema.parse(context.execution.plan); route = context.execution.route; }
    else if (clinical) plan = { agent: 'discovery', understanding: 'This request may need clinical assessment.', steps: [], missingInformation: null };
    else {
      const guarded = safetyPlan(request.content);
      if (guarded) plan = guarded;
      else {
        route = request.caseId ? undefined : await discoveryRoute(request.content, context.tools?.repository ?? defaultToolDependencies.repository);
        if (route) {
          plan = route.plan;
          diagnostics.discoveryRouting = 'catalog';
          if (!route.normalized.missingEntities.length) {
            try {
              const suggested = await planRequest(context.provider, request.content, caseContext, undefined, (failure) => {
                execution.planningErrors.push({ code: failure.code, message: failure.publicMessage });
                diagnostics.modelPlanError = failure.code;
                diagnostics.validationError = typeof failure.cause === 'string' ? failure.cause.slice(0, 300) : null;
                diagnostics.recoveryAttempted = true;
              }, context.supportedAgents, context.conversation);
              if (suggested.agent !== route.plan.agent || JSON.stringify(suggested.steps) !== JSON.stringify(route.plan.steps)) {
                diagnostics.modelPlanError ??= 'PLAN_RELEVANCE_OVERRIDE';
                diagnostics.recoveryAttempted = true;
              }
            } catch (error) {
              const failure = publicFailure(error);
              diagnostics.modelPlanError = failure.code;
              diagnostics.validationError = typeof failure.cause === 'string' ? failure.cause.slice(0, 300) : null;
              diagnostics.recoveryAttempted = true;
            }
          }
        } else plan = await planRequest(context.provider, request.content, caseContext, undefined, (failure) => execution.planningErrors.push({ code: failure.code, message: failure.publicMessage }), context.supportedAgents, context.conversation);
      }
    }
  } catch (error) {
    const failure = publicFailure(error);
    const failedRunId = runId;
    await execution.transition('failed');
    const failedResponse: AgentResponse = { conversationId, runId: failedRunId, agent: 'discovery', status: 'failed',
      understanding: 'The request could not be planned safely.', summary: 'I couldn’t complete this search. Please try a more specific catalog request.', findings: [],
      nextSteps: ['Try again with a treatment, specialty, or location.'], question: null, tasks: [] };
    failedResponse.activity = execution.activity();
    await execution.persist(failedResponse);
    await context.store.saveOutput(failedRunId, assistantResponseSchema.parse(failedResponse));
    await context.store.addMessage(conversationId, 'assistant', failedResponse.summary, failedRunId, { response: failedResponse });
    await context.store.finishRun(failedRunId, 'failed', failure.code, diagnostics);
    return failedResponse;
  }

  execution.goal = plan.understanding; execution.agent = plan.agent;
  await execution.persist();
  const tasks: AgentTaskView[] = [];
  const findings: Finding[] = [];
  const results: Array<{ tool: string; input?: string; taskId?: string; result: ToolResult }> = [];
  let status: AgentResponse['status'] = 'completed';
  let question: string | null = null;
  let approval: string | undefined;
  let approvalId: string | undefined;
  let approvalProposal: AgentResponse['approvalProposal'];
  const started = execution.started;
  try {
    if (clinical) {
      let response: AgentResponse = { conversationId, runId, agent: plan.agent, status, understanding: safeText(plan.understanding),
        summary: 'I cannot diagnose symptoms. If symptoms may be urgent, seek emergency care now. A licensed clinician can assess them.',
        findings, nextSteps: ['Contact a qualified medical professional for an assessment.'], question: null, tasks };
      if (context.execution?.finalize) response = await context.execution.finalize(response, results);
      if (context.finalizeResponse) response = await context.finalizeResponse(response);
      await execution.transition('completed');
      response.activity = execution.activity();
      await execution.persist(response);
      response = assistantResponseSchema.parse(attachReferences(response));
      await context.store.saveOutput(runId, response);
      await context.store.addMessage(conversationId, 'assistant', response.summary, runId, { response });
      await context.store.finishRun(runId, status);
      return response;
    }
    let activePlan = plan;
    const dependencies = route ? routeToolDependencies(route, context.tools ?? defaultToolDependencies) : context.tools ?? defaultToolDependencies;
    const used = new Set<string>();
    let limited = false;
    let legacyFollowUps = 0;
    let requiredSteps = [...plan.steps];
    const modelControlsReads = !route && !context.execution && !requestBoundary(request.content);
    if (modelControlsReads) activePlan = { ...plan, steps: requiredSteps.splice(0, 1) };
    for (let iteration = 0; iteration < AGENT_LIMITS.maxPlanIterations; iteration++) {
      const steps = activePlan.steps.slice(0, AGENT_LIMITS.maxToolCalls - tasks.length)
        .filter((step) => !(findings.length && step.tool === 'request_user_information'));
      if (activePlan.steps.length > steps.length) { limited = true; execution.warnings.push('Tool call limit reached; some requested work remains incomplete.'); }
      const offset = tasks.length;
      for (const step of steps) {
        used.add(`${step.tool}:${step.input}`);
        const id = await context.store.createTask(runId, plan.agent, step.objective, step.tool, request.caseId,
          context.execution?.taskLinks?.[`${step.tool}:${step.input}`]);
        tasks.push({ id, objective: step.objective, tool: step.tool, status: 'pending' });
      }
      for (const [index, step] of steps.entries()) {
        const task = tasks[offset + index];
        const taskId = task.id;
        if (Date.now() - started >= AGENT_LIMITS.runTimeoutMs || execution.failures >= AGENT_LIMITS.maxFailures) { limited = true; execution.warnings.push('Execution safety limit reached; some work remains incomplete.'); break; }
        task.status = 'running'; task.startedAt = new Date().toISOString();
        await context.store.updateTask(taskId, 'running');
        const toolStarted = Date.now();
        try {
          let input: unknown; try { input = JSON.parse(step.input); } catch { input = null; }
          const observation = await executeRegisteredTool(execution, { tool: step.tool, input, taskId }, {
            agent: plan.agent, userId: context.userId, caseId: request.caseId, caseAccess: context.caseAccess,
            referenceBoundary: context.execution?.referenceBoundary, researchAuthorization: context.execution?.researchAuthorization,
            documentAuthorization: context.execution?.documentAuthorization,
            verificationAuthorization: context.execution?.verificationAuthorization,
            observedRecordIds: findings.map((f) => f.provenance.recordId),
          }, dependencies);
          if (observation.error) throw new AgentError(observation.error.code, observation.error.message);
          const rawResult = observation.data!;
          const result = toolResultSchema.parse(route?.normalized.entities.relatedProcedure && step.tool === 'get_treatment'
            ? { ...rawResult, findings: rawResult.findings.map((item) => ({ ...item, matchType: 'related' as const,
              matchReason: 'A broader catalog topic only; it does not confirm the requested procedure or any provider.' })) }
            : rawResult);
          const duration = Date.now() - toolStarted;
          results.push({ tool: step.tool, input: step.input, taskId, result });
          findings.push(...result.findings);
          if (result.approvalRequired) { status = 'awaiting_approval'; approval = result.approvalRequired; task.status = 'awaiting_approval'; }
          else if (result.requestedInformation) { status = 'awaiting_user_input'; question = result.requestedInformation; task.status = 'awaiting_user_input'; }
          else task.status = 'completed';
          task.completedAt = new Date().toISOString();
          await context.store.updateTask(taskId, task.status, undefined, result);
          const actionId = observation.status === 'reused' ? undefined : await context.store.recordAction(runId, taskId, step.tool, result.approvalRequired ? 'proposed' : 'completed', duration, input, result);
          if (result.approvalRequired) {
            const args = input as Record<string, string>;
            approvalId = actionId;
            approvalProposal = { action: step.tool, detail: step.tool === 'create_case' || step.tool === 'update_case'
              ? `Case title: ${String(args.title)}` : step.tool === 'create_agent_task' ? `Task: ${String(args.objective)}` : result.approvalRequired };
          }
          if (result.approvalRequired || result.requestedInformation) break;
        } catch (error) {
          const failure = publicFailure(error);
          task.status = 'failed'; task.errorCode = failure.code; task.completedAt = new Date().toISOString();
          await context.store.updateTask(taskId, 'failed', failure.code);
          await context.store.recordAction(runId, taskId, step.tool, 'failed', Date.now() - toolStarted, step.input, undefined, failure.code);
          diagnostics.toolFailure = failure.code;
          status = 'failed';
          continue;
        }
      }
      if (context.execution?.nextSteps && status !== 'awaiting_approval' && status !== 'awaiting_user_input'
        && iteration + 1 < AGENT_LIMITS.maxPlanIterations) {
        const next = await context.execution.nextSteps(results, tasks);
        activePlan = planSchema.parse({ ...plan, steps: next });
        if (next.length && tasks.length < AGENT_LIMITS.maxToolCalls) continue;
      }
      if (['awaiting_approval', 'awaiting_user_input'].includes(status) || limited) break;
      if (activePlan.missingInformation && findings.length === 0) { status = 'awaiting_user_input'; question = activePlan.missingInformation; break; }
      const mayExtend = context.execution?.allowModelFollowUps !== false && execution.calls.length > 0 && !requestBoundary(request.content) && !context.execution?.messageSourceId && !(typeof context.execution?.diagnostics?.workflow === 'string' && context.execution.diagnostics.workflow.startsWith('reference'))
        && !context.execution?.referenceBoundary && context.execution?.diagnostics?.workflow !== 'external_research' && context.execution?.diagnostics?.workflow !== 'document_coordination' && context.execution?.diagnostics?.workflow !== 'provider_verification' && !results.some(r => r.result.research)
        && (!route && !context.execution || /\b(compare|check|missing|included|accommodation)\b/i.test(request.content));
      if (!mayExtend) break;
      if (iteration + 1 >= AGENT_LIMITS.maxPlanIterations || tasks.length >= AGENT_LIMITS.maxToolCalls || execution.failures >= AGENT_LIMITS.maxFailures) {
        limited = true; execution.warnings.push('Planning safety limit reached; further work could not be completed.'); break;
      }
      try {
        const constrained = Boolean(route || context.execution);
        const decision = await observeNext(context.provider, execution, plan.agent, constrained);
        if (decision.action === 'finish') {
          if (requiredSteps.length && modelControlsReads) { activePlan = { ...plan, steps: requiredSteps.splice(0, 1) }; continue; }
          break;
        }
        if (decision.action === 'partial') { limited = true; execution.warnings.push('The model reported remaining catalog work.'); break; }
        if (decision.action === 'clarify') {
          if (!findings.length) { status = 'awaiting_user_input'; question = decision.question; }
          break;
        }
        if (decision.action !== 'call_tool') {
          if (requiredSteps.length && modelControlsReads) { activePlan = { ...plan, steps: requiredSteps.splice(0, 1) }; continue; }
          break;
        }
        const name = decision.tool!;
        let args: unknown; try { args = JSON.parse(decision.input!); } catch { args = null; }
        const definition = Object.hasOwn(toolRegistry, name) ? toolRegistry[name as keyof typeof toolRegistry] : undefined;
        if (!definition || definition.mode !== 'read' || definition.authorization === 'case_consent'
          || constrained && !['check_requirements', 'compare_providers'].includes(name) || decision.version && decision.version !== '1') {
          await executeRegisteredTool(execution, { tool: name, version: decision.version ?? '1', input: args },
            { agent: plan.agent, userId: '', caseAccess: context.caseAccess }, dependencies);
          activePlan = { ...plan, steps: [] };
          // The next iteration observes this rejection and can select a safe correction.
          continue;
        }
        requiredSteps = requiredSteps.filter((s) => s.tool !== name || s.input !== decision.input);
        activePlan = { ...plan, steps: [{ objective: definition.displayName, tool: definition.name, input: decision.input! }], missingInformation: null };
      } catch {
        diagnostics.observationFallback = true;
        // Compatibility with existing providers that only support plan/synthesis.
        if (requiredSteps.length && modelControlsReads) { activePlan = { ...plan, steps: requiredSteps.splice(0, 1) }; continue; }
        if (route || context.execution || legacyFollowUps++ >= 1 || !findings.length) break;
        activePlan = await planRequest(context.provider, request.content, caseContext, { agent: plan.agent, findings, usedTools: results.map((r) => r.tool) }, undefined, context.supportedAgents, context.conversation);
        if (!activePlan.steps.some((step) => !used.has(`${step.tool}:${step.input}`))) break;
      }
    }
    {
      for (const pending of tasks.filter((task) => task.status === 'pending')) {
        pending.status = 'blocked'; pending.completedAt = new Date().toISOString();
        await context.store.updateTask(pending.id, 'blocked');
      }
    }
    let summary: string;
    let nextSteps: string[];
    if (approval) { summary = approval; nextSteps = ['Review the proposed action below. No change happens until you approve.']; }
    else if (route) {
      const result = discoverySummary(route, findings);
      summary = result.summary; nextSteps = result.nextSteps;
      if (route.normalized.missingEntities.length) { status = 'awaiting_user_input'; question = plan.missingInformation; }
    } else if (context.execution?.synthesis) {
      const synthesis = synthesisSchema.parse(context.execution.synthesis);
      summary = synthesis.summary; nextSteps = synthesis.nextSteps; question = synthesis.question;
    } else {
      const synthesis = synthesisSchema.parse(await context.provider.generateStructured({
        purpose: 'synthesis', schema: synthesisSchema, maxOutputTokens: 550, timeoutMs: Math.min(AGENT_LIMITS.modelTimeoutMs, Math.max(1, AGENT_LIMITS.runTimeoutMs - (Date.now() - started))),
        system: `You are ${agents[plan.agent].name}. ${agents[plan.agent].safety} Write a concise coordination summary. All provider and cost facts appear in separate trusted cards; do not repeat names, numbers, prices, credentials, or medical claims in your summary. Use only the tool results. If no results, say what information is missing. Do not say any action was completed unless a tool completed it.`,
        input: JSON.stringify({ understanding: safeText(plan.understanding), toolResults: results.map(({ tool, result }) => ({ tool,
          recordNames: result.findings.map((item) => item.title), note: result.note, comparison: result.comparison,
          caseContext: result.caseContext, requestedInformation: result.requestedInformation })), missingInformation: question }),
      }));
      validateSynthesis(synthesis.summary, synthesis.nextSteps, synthesis.question);
      summary = synthesis.summary; nextSteps = synthesis.nextSteps;
      if (synthesis.question && !question && findings.length === 0) { question = synthesis.question; status = 'awaiting_user_input'; }
    }
    const unique = [...new Map(findings.map((item) => [item.provenance.recordId, item])).values()];
    const unsupportedProcedure = Boolean(route?.normalized.entities.procedurePhrase && ['related', 'none'].includes(route.normalized.entities.procedureMatchType));
    const discoveryResult = route && plan.agent !== 'comparison' ? discoveryResultSchema.parse({
      query: request.content, normalizedQuery: route.normalized.normalizedQuery, intent: route.normalized.intent,
      entities: route.normalized.entities, results: unique, relatedResults: unique.filter((item) => item.matchType === 'related'),
      matchType: unsupportedProcedure ? 'none' : unique.some((item) => item.matchType === 'exact') ? 'exact' : unique.some((item) => item.matchType === 'related') ? 'related' : 'none',
      matchReason: route.normalized.missingEntities.length ? 'A required procedure is missing from the request.'
        : !unique.length && route.normalized.entities.procedure ? 'The treatment is in the catalog, but no provider met all search criteria.'
          : route.normalized.matchReason,
      missingEntities: route.normalized.missingEntities,
      sources: unique.map((item) => item.provenance), nextActions: nextSteps, recovered: Boolean(diagnostics.recoveryAttempted),
    }) : undefined;
    const discovery = discoveryResult ? { normalizedQuery: discoveryResult.normalizedQuery, matchType: discoveryResult.matchType,
      matchReason: discoveryResult.matchReason, recovered: discoveryResult.recovered } : undefined;
    let response: AgentResponse = { conversationId, runId, agent: plan.agent, status, understanding: safeText(plan.understanding),
      summary, findings: unique.slice(0, 30), analyses: results.flatMap((r) => r.result.analysis ? [r.result.analysis] : []), summarySource: route || context.execution?.synthesis ? 'application' : 'model', nextSteps, question, tasks, approvalId, approvalProposal, discovery };
    if (context.execution?.finalize) response = await context.execution.finalize(response, results);
    if (context.finalizeResponse) response = await context.finalizeResponse(response);
    const failedCalls = execution.calls.filter((c) => c.status === 'failed' && !execution.calls.some((next) => next.step > c.step && next.tool === c.tool && ['completed', 'reused'].includes(next.status) && (c.error?.code === 'TOOL_INPUT_INVALID' || canonicalInput(next.input) === canonicalInput(c.input))));
    if (status === 'failed' && !failedCalls.length && results.length) response.status = 'completed';
    if (failedCalls.length || limited) {
      response.summary = `${response.summary} ${failedCalls.length ? `${[...new Set(failedCalls.map((c) => c.tool.replaceAll('_', ' ')))].join(', ')} could not be completed. Successful sourced results are preserved.` : 'Some requested work remains incomplete because an execution limit was reached.'}`.slice(0, 1600);
      if (response.status === 'completed' && !results.length && failedCalls.length) response.status = 'failed';
    }
    const catalogIncomplete = response.compoundRequest?.operations.some((o) => o.status === 'incomplete' || o.status === 'skipped')
      || response.verification?.report && response.verification.report.status !== 'completed'
      || response.analyses?.some((a) => !a.complete) || response.research && response.research.status !== 'completed'
      || response.researchComparison && !response.researchComparison.complete;
    if (response.compoundRequest || response.comparison) response.summarySource = 'derived';
    const finalState = response.status === 'awaiting_user_input' ? 'waiting_for_input' : response.status === 'awaiting_approval' ? 'awaiting_confirmation'
      : response.status === 'failed' && !response.findings.length ? 'failed' : failedCalls.length || limited || catalogIncomplete ? 'partially_completed' : 'completed';
    await execution.transition(finalState);
    response.activity = execution.activity();
    response = assistantResponseSchema.parse(attachReferences(response));
    await execution.persist(response);
    if (diagnostics.recoveryAttempted) diagnostics.recoveryResult = response.status;
    await context.store.saveOutput(runId, response);
    await context.store.addMessage(conversationId, 'assistant', response.summary, runId, { response });
    await context.store.finishRun(runId, response.status, undefined, diagnostics);
    return response;
  } catch (error) {
    const failure = publicFailure(error);
    console.error(JSON.stringify({ event: 'agent_run_failed', runId, code: failure.code }));
    let failedResponse: AgentResponse = { conversationId, runId, agent: plan.agent, status: 'failed',
      understanding: safeText(plan.understanding), summary: failure.publicMessage, findings, nextSteps: ['Try again or narrow the request.'], question: null, tasks };
    if (context.execution?.finalize) failedResponse = await context.execution.finalize(failedResponse, results);
    if (context.finalizeResponse) failedResponse = await context.finalizeResponse(failedResponse);
    if (!terminalStates.has(execution.state)) await execution.transition(findings.length ? 'partially_completed' : 'failed');
    failedResponse.activity = execution.activity();
    failedResponse = assistantResponseSchema.parse(attachReferences(failedResponse));
    await execution.persist(failedResponse);
    await context.store.saveOutput(runId, failedResponse);
    await context.store.addMessage(conversationId, 'assistant', failedResponse.summary, runId, { response: failedResponse });
    await context.store.finishRun(runId, 'failed', failure.code, { ...diagnostics, ...(diagnostics.recoveryAttempted ? { recoveryResult: 'failed' } : {}) });
    return failedResponse;
  }
}
