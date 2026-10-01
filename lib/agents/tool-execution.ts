import { ZodError } from 'zod';
import { authorizeDocumentTool } from '@/lib/documents/service';
import { AgentError } from './errors';
import { toolRegistry, toolAliases, type ToolContext, type ToolDependencies } from './tools';
import { toolNameSchema, type ToolResult } from './schemas';
import { AGENT_LIMITS, canonicalInput, ExecutionState, safeText, safeValue, type ToolObservation } from './execution-state';

/** Only this boundary turns a proposal into a registered service invocation. */
export async function executeRegisteredTool(state: ExecutionState, proposal: { tool: string; version?: string; input: unknown; taskId?: string },
  context: ToolContext, dependencies: ToolDependencies): Promise<ToolObservation> {
  if (state.state === 'executing') throw new AgentError('TOOL_RECURSION_DENIED', 'Nested tool execution is unavailable.');
  const call = state.begin(proposal.tool, proposal.version ?? '1', proposal.input);
  call.taskId = proposal.taskId;
  await state.transition('executing');
  let output: ToolResult | undefined;
  try {
    const parsedName = toolNameSchema.safeParse(proposal.tool);
    if (!parsedName.success || !Object.hasOwn(toolRegistry, proposal.tool)) throw new AgentError('TOOL_UNKNOWN', 'This tool is unavailable.');
    const name = parsedName.data;
    const definition = toolRegistry[name];
    if (call.version !== definition.version) throw new AgentError('TOOL_VERSION_UNSUPPORTED', 'This tool version is unavailable.');
    if (!context.userId || !definition.allowedAgents.includes(context.agent)) throw new AgentError('TOOL_DENIED', 'This agent cannot perform that action.');
    if (['write', 'external', 'clinical'].includes(definition.mode)
      && !(definition.mode === 'write' && authorizeDocumentTool(name,proposal.input,context.userId,context.documentAuthorization)))
      throw new AgentError('TOOL_CONFIRMATION_REQUIRED', 'This action needs a separate authorized confirmation or professional review.');
    const parsed = definition.inputSchema.safeParse(proposal.input);
    if (!parsed.success || safeText(JSON.stringify(proposal.input)) !== JSON.stringify(proposal.input)) throw new AgentError('TOOL_INPUT_INVALID', 'The requested tool arguments are invalid.');
    call.validatedInput = safeValue(parsed.data);
    const reference = context.referenceBoundary;
    if (reference && (reference.status !== 'resolved' || !reference.allowedCalls.some(c => c.tool === name && canonicalInput(c.input) === canonicalInput(parsed.data))))
      throw new AgentError('REFERENCE_TOOL_BLOCKED', 'Identify the referenced result before continuing.');
    if (name === 'research_healthcare_information' && (!context.researchAuthorization?.internalToolCompleted
      || !state.observations.some(o => ['search_hospitals', 'search_packages'].includes(o.tool) && ['completed', 'empty', 'reused'].includes(o.status))
      || canonicalInput(parsed.data) !== canonicalInput(context.researchAuthorization.input)))
      throw new AgentError('RESEARCH_NOT_AUTHORIZED', 'External research needs an identified internal information gap.');
    const canonicalName = name in toolAliases ? toolAliases[name as keyof typeof toolAliases] : name;
    call.canonicalTool = canonicalName;
    const key = `${canonicalName}:${canonicalInput(parsed.data)}`;
    const cached = definition.mode === 'read' && definition.authorization !== 'case_consent' ? state.cache.get(key) : undefined;
    const limit = state.limit(canonicalName);
    if (cached && Date.now() - cached.at < AGENT_LIMITS.cacheFreshMs) {
      output = cached.output; call.status = 'reused';
    } else {
      if (limit) { state.warnings.push(limit); throw new AgentError('TOOL_BUDGET_EXHAUSTED', limit); }
      state.executions++;
      await state.persist();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const remaining = AGENT_LIMITS.runTimeoutMs - (Date.now() - state.started);
        const raw = await Promise.race([definition.execute(parsed.data, context, dependencies), new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new AgentError('TOOL_TIMEOUT', context.agent==='document_coordination' ? 'This document operation took too long.' : 'This catalog operation took too long.')), Math.min(definition.timeoutMs, remaining));
        })]);
        const valid = definition.outputSchema.safeParse(raw);
        if (!valid.success || safeText(JSON.stringify(raw)) !== JSON.stringify(raw)) throw new AgentError('TOOL_OUTPUT_INVALID', 'This tool returned an invalid result.');
        output = valid.data;
      } finally { if (timer) clearTimeout(timer); }
      call.status = 'completed';
      if (definition.mode === 'read' && definition.authorization !== 'case_consent') state.cache.set(key, { output, at: Date.now() });
    }
    // Case context stays in existing consent-controlled storage, not the new model observations.
    call.output = { ...output, caseContext: undefined };
    call.provenance = [
      ...(output.documents ? [{ kind: 'user', recordIds: output.documents.documents.map(d=>d.id) },
        ...output.documents.requirements.map(r=>({kind:r.source.kind,recordIds:[r.id]}))] : []),
      ...(output.research ? [{ kind: 'external_source', recordIds: output.research.sources.map(s => s.id) }] : []),
      ...['synthetic', 'external', 'first_party'].flatMap((kind) => {
        const ids = output!.findings.filter((f) => f.provenance.sourceKind === kind).map((f) => f.provenance.recordId);
        return ids.length ? [{ kind: kind === 'first_party' ? 'catalog' : kind, recordIds: ids }] : [];
      }), ...(output.analysis ? [{ kind: 'derived', recordIds: output.analysis.recordIds }] : []),
    ];
  } catch (error) {
    state.failures++;
    call.status = 'failed';
    call.error = { code: error instanceof ZodError ? 'TOOL_OUTPUT_INVALID' : error instanceof AgentError ? error.code : 'TOOL_FAILURE',
      message: error instanceof AgentError && (error.code.startsWith('TOOL_') || context.agent==='document_coordination'&&error.code.startsWith('DOCUMENT_'))
        ? safeText(error.publicMessage).slice(0, 120) : context.agent==='document_coordination' ? 'This document operation could not be completed.' : 'This catalog operation could not be completed.' };
  }
  call.endedAt = new Date().toISOString();
  const observation: ToolObservation = { id: call.id, tool: call.tool,
    status: call.status === 'failed' ? 'failed' : call.status === 'reused' ? 'reused' : !output?.findings.length && !output?.research?.findings.length && !output?.documents && !output?.requestedInformation && !output?.approvalRequired ? 'empty' : 'completed',
    ...(output ? { data: { ...output, caseContext: undefined } } : {}), provenance: call.provenance,
    missingInformation: output?.analysis?.missingInformation ?? (output?.requestedInformation ? [output.requestedInformation] : []),
    warnings: output?.note ? [output.note] : [], error: call.error,
    nextStepRequired: call.status === 'failed' || Boolean(output?.requestedInformation || (output?.analysis && !output.analysis.complete)),
  };
  state.observations.push(observation);
  await state.transition('observing');
  return output ? { ...observation, data: output } : observation;
}
