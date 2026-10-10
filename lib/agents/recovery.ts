import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CatalogSnapshot } from '@/types/catalog';
import { AgentError } from './errors';
import { planSchema, toolResultSchema, userRequestSchema } from './schemas';
import { toolAliases, toolRegistry } from './tools';
import { canonicalInput, safeText, type ExecutionState } from './execution-state';
import type { RunActivity } from './execution-schemas';

// Longer than the existing 150-second conversation lease and hosting request limit.
export const RECOVERY_IDLE_MS = 180000;
export const MAX_RECOVERIES = 1;
const catalogTools = new Set(['search_treatments', 'search_hospitals', 'search_doctors', 'search_packages',
  'search_countries', 'search_services', 'get_treatment', 'get_hospital', 'get_doctor', 'get_package', 'get_country',
  'get_treatment_details', 'get_hospital_details', 'get_doctor_details', 'get_package_details', 'search_locations',
  'check_requirements', 'compare_providers', 'compare_treatment_options']);
export function recoverableTool(tool: string) {
  const definition = Object.hasOwn(toolRegistry, tool) ? toolRegistry[tool as keyof typeof toolRegistry] : undefined;
  return catalogTools.has(tool) && definition?.mode === 'read' && definition.authorization === 'authenticated';
}
export function catalogSignature(snapshot: CatalogSnapshot) {
  return createHash('sha256').update(canonicalInput(snapshot)).digest('hex');
}
const callSchema = z.object({ id: z.uuid(), runId: z.uuid(), taskId: z.uuid().optional(), tool: z.string(), version: z.literal('1'),
  input: z.unknown(), validatedInput: z.unknown().optional(), step: z.number().int().positive(),
  status: z.enum(['running', 'completed', 'failed', 'reused']), output: toolResultSchema.optional(),
  startedAt: z.iso.datetime(), endedAt: z.iso.datetime().optional(),
  attempts: z.number().int().min(1).max(2).optional(), error: z.object({code:z.string(),message:z.string()}).optional(),
  provenance: z.array(z.object({kind:z.string(),recordIds:z.array(z.string())})),
}).strip();
export const recoveryCheckpointSchema = z.object({
  runId: z.uuid(), conversationId: z.uuid(), ownerId: z.uuid(), state: z.string(), updatedAt: z.iso.datetime(),
  executions: z.number().int().min(0).max(8), calls: z.array(callSchema).max(16),
  checkpoint: z.object({request:userRequestSchema,plan:planSchema,snapshotSignature:z.string().regex(/^[a-f0-9]{64}$/),
    recoverable:z.literal(true),recoveryCount:z.number().int().min(0).max(MAX_RECOVERIES)}),
}).strip();
export type RecoveryCheckpoint = z.infer<typeof recoveryCheckpointSchema>;

export function recoveryAvailability(raw: unknown, now = Date.now()): NonNullable<RunActivity['recovery']> {
  const parsed = recoveryCheckpointSchema.safeParse(raw);
  if (!parsed.success) return {eligible:false,reason:'This workflow cannot be resumed automatically. Review its saved results and next action.'};
  const state=parsed.data, request=state.checkpoint.request;
  if (!['queued','planning','executing','observing'].includes(state.state))
    return {eligible:false,reason:'This run has finished or requires your input. Follow its recorded next action.'};
  if (request.caseId || request.resumeRunId || request.conversationId !== state.conversationId
    || state.checkpoint.recoveryCount >= MAX_RECOVERIES
    || !state.checkpoint.plan.steps.every(s=>recoverableTool(s.tool)) || !state.calls.every(c=>recoverableTool(c.tool) && c.runId===state.runId))
    return {eligible:false,reason:'Automatic recovery is unavailable for this workflow. No consequential action will be replayed.'};
  if (now-Date.parse(state.updatedAt)<RECOVERY_IDLE_MS)
    return {eligible:false,reason:'The server may still be working. Wait for its saved progress before resuming.'};
  return {eligible:true,reason:'This catalog workflow stopped updating. Resume to recheck current publication and finish eligible reads.'};
}

/** Never hydrate private reads, proposals, writes, or stale catalog evidence. */
export function restoreCatalogReads(state: ExecutionState, prior: RecoveryCheckpoint, signature: string) {
  if (prior.runId!==state.runId || prior.ownerId!==state.ownerId || prior.conversationId!==state.conversationId)
    throw new AgentError('RECOVERY_ACCESS_DENIED','This workflow is unavailable.');
  state.executions=prior.executions;
  state.calls=prior.calls.map(c=>({...c, retrying:false, ...(c.status==='running'?{status:'failed' as const,
    endedAt:new Date().toISOString(),error:{code:'TOOL_INTERRUPTED',message:'The server stopped before this read was confirmed.'}}:{})}));
  if(signature!==prior.checkpoint.snapshotSignature) {
    state.warnings.push('Published catalog evidence changed. Previous reads will be checked again.'); return;
  }
  for (const call of prior.calls) {
    if (!['completed','reused'].includes(call.status) || !call.output || !recoverableTool(call.tool)) continue;
    const name=call.tool as keyof typeof toolRegistry, definition=toolRegistry[name];
    const input=definition.inputSchema.safeParse(call.validatedInput), output=definition.outputSchema.safeParse(call.output);
    if(!input.success || !output.success || safeText(JSON.stringify(output.data))!==JSON.stringify(output.data)
      || output.data.caseContext || output.data.documents || output.data.verification || output.data.inquiries || output.data.coordination
      || output.data.research || output.data.approvalRequired || output.data.requestedInformation) continue;
    const canonicalName=name in toolAliases?toolAliases[name as keyof typeof toolAliases]:name;
    state.cache.set(`${canonicalName}:${canonicalInput(input.data)}`,{output:output.data,at:Date.now()});
  }
  state.warnings.push('Resumed from saved read results after checking the current published catalog.');
}
