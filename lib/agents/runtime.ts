import type { LLMProvider } from '@/lib/ai/contracts';
import { ZodError } from 'zod';
import { AgentError } from './errors';
import { discoveryRoute, routeToolDependencies, type DiscoveryRoute } from './discovery-routing';
import { agents } from './registry';
import { assistantResponseSchema, discoveryResultSchema, planSchema, synthesisSchema, toolResultSchema, userRequestSchema, type AgentId, type AgentPlan, type AgentResponse, type AgentTaskView, type Finding, type ToolResult } from './schemas';
import { executeTool, type CaseAccess, type ToolDependencies, defaultToolDependencies, toolDescriptions, toolSchemas } from './tools';
import type { AgentStore } from './persistence';

export const AGENT_LIMITS = { maxToolCalls: 8, maxPlanIterations: 2, maxPlanningAttempts: 2, modelTimeoutMs: 25000, toolTimeoutMs: 12000, runTimeoutMs: 80000 } as const;
const clinicalPattern = /\b(chest pain|chest hurts|can't breathe|cannot breathe|stroke symptoms|suicid|diagnos(e|is)|what disease|prescrib(e|tion))\b/i;
const externalPatterns: Array<[RegExp, 'share_records' | 'booking' | 'payment' | 'travel_purchase' | 'visa_submission']> = [
  [/\b(send|share|forward|submit|email)\b.*\b(medical|report|record|document|scan|test result)s?\b/i, 'share_records'],
  [/\b(book|schedule)\b.*\b(appointment|consultation|hospital|doctor)\b/i, 'booking'],
  [/\b(pay|payment|transfer money)\b/i, 'payment'],
  [/\b(buy|purchase|book)\b.*\b(flight|hotel|travel)\b/i, 'travel_purchase'],
  [/\b(submit|file)\b.*\bvisa\b/i, 'visa_submission'],
];

export interface RuntimeContext {
  userId: string;
  caseAccess: CaseAccess;
  store: AgentStore;
  provider: LLMProvider;
  tools?: ToolDependencies;
  supportedAgents?: readonly AgentId[];
  execution?: {
    plan: AgentPlan; route?: DiscoveryRoute; carePlanId?: string;
    taskLinks?: Record<string, string>;
    diagnostics?: Record<string, string | boolean | null>;
    finalize?: (response: AgentResponse, results: Array<{ tool: string; result: ToolResult }>) => Promise<AgentResponse>;
  };
}

export function requestBoundary(content: string): 'clinical' | 'external' | undefined {
  if (clinicalPattern.test(content) || /\b(should i (?:have|undergo)|do i need (?:surgery|treatment)|best treatment|medically appropriate|what medication)\b/i.test(content)) return 'clinical';
  return externalPatterns.some(([pattern]) => pattern.test(content)) ? 'external' : undefined;
}

function publicFailure(error: unknown): AgentError {
  return error instanceof AgentError ? error : new AgentError('AGENT_FAILURE', 'The assistant could not complete this request. Please try again.', error);
}

function validateSynthesis(summary: string, nextSteps: readonly string[], question: string | null) {
  const text = [summary, ...nextSteps, question ?? ''].join(' ');
  if (/\b(you have|you need surgery|best hospital|safest hospital|guaranteed outcome|confirmed booking|success rate)\b|[$₹]/i.test(text)) {
    throw new AgentError('UNSAFE_MODEL_OUTPUT', 'The assistant could not prepare a reliable summary. Please try again.');
  }
}

async function boundedTool<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<T>((_resolve, reject) => {
      timer = setTimeout(() => reject(new AgentError('TOOL_TIMEOUT', 'A catalog search took too long. Please try again.')), AGENT_LIMITS.toolTimeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

export function safetyPlan(content: string): AgentPlan | undefined {
  const external = externalPatterns.find(([pattern]) => pattern.test(content));
  if (external) return { agent: 'treatment_planning', understanding: 'You requested an action involving an external service.',
    steps: [{ objective: 'Record this action for human review', tool: 'request_external_action', input: JSON.stringify({ action: external[1] }) }], missingInformation: null };
  return undefined;
}

async function planRequest(provider: LLMProvider, content: string, caseContext?: Record<string, unknown>,
  followUp?: { agent: AgentPlan['agent']; findings: Finding[]; usedTools: string[] }, onValidationError?: (failure: AgentError) => void, supportedAgents?: readonly AgentId[]): Promise<AgentPlan> {
  const definitions = Object.values(agents).filter((agent) => !supportedAgents || supportedAgents.includes(agent.id)).map(({ id, purpose, allowedTools, safety }) => ({ id, purpose, allowedTools, safety }));
  const system = `You are MedBridge's non-clinical care coordination planner. Select one agent and up to ${AGENT_LIMITS.maxToolCalls} allowed tools. Never invent catalog entities or treat a related procedure as an exact match. A hospital offers a procedure only when a tool confirms an explicit treatment link. Do not ask for a locality when a city is supplied, or for a budget unless required. Ask only for genuinely missing information. Never diagnose, prescribe, invent prices or availability, or expose tool errors. The catalog contains synthetic/demo records. ${followUp ? `This is iteration two. Keep agent ${followUp.agent}; use only needed new tools with returned slugs.` : ''} Agent definitions: ${JSON.stringify(definitions)}. Tool descriptions: ${JSON.stringify(toolDescriptions)}. Tool input JSON schemas: ${JSON.stringify(Object.fromEntries(Object.entries(toolSchemas).map(([name, schema]) => [name, schema.toJSONSchema()])))}.`;
  let lastError: unknown;
  for (let attempt = 0; attempt < AGENT_LIMITS.maxPlanningAttempts; attempt++) {
    try {
      const raw = await provider.generateStructured({ purpose: 'plan', system,
        input: JSON.stringify({ request: content, caseContext: caseContext ?? null,
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
  if (request.caseId) caseContext = await context.caseAccess.readContext(request.caseId);
  const conversationId = request.conversationId ?? await context.store.createConversation(context.userId, request.caseId);
  if (request.conversationId) await context.store.assertConversation(conversationId, context.userId, request.caseId);
  await context.store.addMessage(conversationId, 'user', request.content);

  const clinical = requestBoundary(request.content) === 'clinical';
  let route: DiscoveryRoute | undefined;
  const diagnostics: Record<string, string | boolean | null> = { ...context.execution?.diagnostics };
  let plan: AgentPlan;
  try {
    if (context.execution && !clinical) { plan = planSchema.parse(context.execution.plan); route = context.execution.route; }
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
                diagnostics.modelPlanError = failure.code;
                diagnostics.validationError = typeof failure.cause === 'string' ? failure.cause.slice(0, 300) : null;
                diagnostics.recoveryAttempted = true;
              }, context.supportedAgents);
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
        } else plan = await planRequest(context.provider, request.content, caseContext, undefined, undefined, context.supportedAgents);
      }
    }
  } catch (error) {
    const failure = publicFailure(error);
    const failedRunId = await context.store.startRun(conversationId, context.userId, 'discovery', request.caseId);
    const failedResponse: AgentResponse = { conversationId, runId: failedRunId, agent: 'discovery', status: 'failed',
      understanding: 'The request could not be planned safely.', summary: 'I couldn’t complete this search. Please try a more specific catalog request.', findings: [],
      nextSteps: ['Try again with a treatment, specialty, or location.'], question: null, tasks: [] };
    await context.store.saveOutput(failedRunId, assistantResponseSchema.parse(failedResponse));
    await context.store.addMessage(conversationId, 'assistant', failedResponse.summary, failedRunId, { response: failedResponse });
    await context.store.finishRun(failedRunId, 'failed', failure.code, diagnostics);
    return failedResponse;
  }

  const runId = await context.store.startRun(conversationId, context.userId, plan.agent, request.caseId, context.execution?.carePlanId);
  const tasks: AgentTaskView[] = [];
  const findings: Finding[] = [];
  const results: Array<{ tool: string; result: ToolResult }> = [];
  let status: AgentResponse['status'] = 'completed';
  let question: string | null = null;
  let approval: string | undefined;
  let approvalId: string | undefined;
  let approvalProposal: AgentResponse['approvalProposal'];
  const started = Date.now();
  try {
    if (clinical) {
      let response: AgentResponse = { conversationId, runId, agent: plan.agent, status, understanding: plan.understanding,
        summary: 'I cannot diagnose symptoms. If symptoms may be urgent, seek emergency care now. A licensed clinician can assess them.',
        findings, nextSteps: ['Contact a qualified medical professional for an assessment.'], question: null, tasks };
      if (context.execution?.finalize) response = await context.execution.finalize(response, results);
      response = assistantResponseSchema.parse(response);
      await context.store.saveOutput(runId, response);
      await context.store.addMessage(conversationId, 'assistant', response.summary, runId, { response });
      await context.store.finishRun(runId, status);
      return response;
    }
    let activePlan = plan;
    const dependencies = route ? routeToolDependencies(route, context.tools ?? defaultToolDependencies) : context.tools ?? defaultToolDependencies;
    const used = new Set<string>();
    for (let iteration = 0; iteration < AGENT_LIMITS.maxPlanIterations; iteration++) {
      const steps = activePlan.steps.slice(0, AGENT_LIMITS.maxToolCalls - tasks.length)
        .filter((step) => !used.has(`${step.tool}:${step.input}`) && !(findings.length && step.tool === 'request_user_information'));
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
        if (Date.now() - started > AGENT_LIMITS.runTimeoutMs) throw new AgentError('RUN_TIMEOUT', 'The assistant took too long. Please try again.');
        task.status = 'running'; task.startedAt = new Date().toISOString();
        await context.store.updateTask(taskId, 'running');
        const toolStarted = Date.now();
        try {
          const input = JSON.parse(step.input);
          const rawResult = await boundedTool(executeTool(step.tool, input, {
            agent: plan.agent, userId: context.userId, caseId: request.caseId, caseAccess: context.caseAccess,
          }, dependencies));
          const result = toolResultSchema.parse(route?.normalized.entities.relatedProcedure && step.tool === 'get_treatment'
            ? { ...rawResult, findings: rawResult.findings.map((item) => ({ ...item, matchType: 'related' as const,
              matchReason: 'A broader catalog topic only; it does not confirm the requested procedure or any provider.' })) }
            : rawResult);
          const duration = Date.now() - toolStarted;
          results.push({ tool: step.tool, result });
          findings.push(...result.findings);
          if (result.approvalRequired) { status = 'awaiting_approval'; approval = result.approvalRequired; task.status = 'awaiting_approval'; }
          else if (result.requestedInformation) { status = 'awaiting_user_input'; question = result.requestedInformation; task.status = 'awaiting_user_input'; }
          else task.status = 'completed';
          task.completedAt = new Date().toISOString();
          await context.store.updateTask(taskId, task.status, undefined, result);
          const actionId = await context.store.recordAction(runId, taskId, step.tool, result.approvalRequired ? 'proposed' : 'completed', duration, input, result);
          if (result.approvalRequired) {
            approvalId = actionId;
            approvalProposal = { action: step.tool, detail: step.tool === 'create_case' || step.tool === 'update_case'
              ? `Case title: ${String(input.title)}` : step.tool === 'create_agent_task' ? `Task: ${String(input.objective)}` : result.approvalRequired };
          }
          if (status !== 'completed') break;
        } catch (error) {
          const failure = publicFailure(error);
          task.status = 'failed'; task.errorCode = failure.code; task.completedAt = new Date().toISOString();
          await context.store.updateTask(taskId, 'failed', failure.code);
          await context.store.recordAction(runId, taskId, step.tool, 'failed', Date.now() - toolStarted, step.input, undefined, failure.code);
          throw failure;
        }
      }
      if (status !== 'completed') break;
      if (activePlan.missingInformation && findings.length === 0) { status = 'awaiting_user_input'; question = activePlan.missingInformation; break; }
      if (route || iteration + 1 >= AGENT_LIMITS.maxPlanIterations || tasks.length >= AGENT_LIMITS.maxToolCalls || findings.length === 0) break;
      activePlan = await planRequest(context.provider, request.content, caseContext, {
        agent: plan.agent, findings, usedTools: results.map((item) => item.tool),
      }, undefined, context.supportedAgents);
      if (!activePlan.steps.some((step) => !used.has(`${step.tool}:${step.input}`))) {
        if (activePlan.missingInformation && findings.length === 0) { status = 'awaiting_user_input'; question = activePlan.missingInformation; }
        break;
      }
    }
    if (status !== 'completed') {
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
    } else {
      const synthesis = synthesisSchema.parse(await context.provider.generateStructured({
        purpose: 'synthesis', schema: synthesisSchema, maxOutputTokens: 550, timeoutMs: AGENT_LIMITS.modelTimeoutMs,
        system: `You are ${agents[plan.agent].name}. ${agents[plan.agent].safety} Write a concise coordination summary. All provider and cost facts appear in separate trusted cards; do not repeat names, numbers, prices, credentials, or medical claims in your summary. Use only the tool results. If no results, say what information is missing. Do not say any action was completed unless a tool completed it.`,
        input: JSON.stringify({ understanding: plan.understanding, toolResults: results.map(({ tool, result }) => ({ tool,
          recordNames: result.findings.map((item) => item.title), note: result.note, comparison: result.comparison,
          caseContext: result.caseContext, requestedInformation: result.requestedInformation })), missingInformation: question }),
      }));
      validateSynthesis(synthesis.summary, synthesis.nextSteps, synthesis.question);
      summary = synthesis.summary; nextSteps = synthesis.nextSteps;
      if (synthesis.question && !question && findings.length === 0) { question = synthesis.question; status = 'awaiting_user_input'; }
    }
    const unique = [...new Map(findings.map((item) => [item.provenance.recordId, item])).values()];
    const unsupportedProcedure = Boolean(route?.normalized.entities.procedurePhrase && ['related', 'none'].includes(route.normalized.entities.procedureMatchType));
    const discoveryResult = route ? discoveryResultSchema.parse({
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
    let response: AgentResponse = { conversationId, runId, agent: plan.agent, status, understanding: plan.understanding,
      summary, findings: unique, nextSteps, question, tasks, approvalId, approvalProposal, discovery };
    if (context.execution?.finalize) response = await context.execution.finalize(response, results);
    response = assistantResponseSchema.parse(response);
    if (diagnostics.recoveryAttempted) diagnostics.recoveryResult = response.status;
    await context.store.saveOutput(runId, response);
    await context.store.addMessage(conversationId, 'assistant', response.summary, runId, { response });
    await context.store.finishRun(runId, response.status, undefined, diagnostics);
    return response;
  } catch (error) {
    const failure = publicFailure(error);
    console.error(JSON.stringify({ event: 'agent_run_failed', runId, code: failure.code }));
    let failedResponse: AgentResponse = { conversationId, runId, agent: plan.agent, status: 'failed',
      understanding: plan.understanding, summary: failure.publicMessage, findings, nextSteps: ['Try again or narrow the request.'], question: null, tasks };
    if (context.execution?.finalize) failedResponse = await context.execution.finalize(failedResponse, results);
    failedResponse = assistantResponseSchema.parse(failedResponse);
    await context.store.saveOutput(runId, failedResponse);
    await context.store.addMessage(conversationId, 'assistant', failedResponse.summary, runId, { response: failedResponse });
    await context.store.finishRun(runId, 'failed', failure.code, { ...diagnostics, ...(diagnostics.recoveryAttempted ? { recoveryResult: 'failed' } : {}) });
    return failedResponse;
  }
}
