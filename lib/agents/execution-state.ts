import { randomUUID } from 'node:crypto';
import type { AgentStore } from './persistence';
import type { ToolResult } from './schemas';
import { activitySchema, type RunActivity, type RunState } from './execution-schemas';
import { AgentError } from './errors';

export const AGENT_LIMITS = { maxToolCalls: 8, maxPlanIterations: 8, maxPlanningAttempts: 2,
  maxRepeatedToolCalls: 6, maxFailures: 3, maxProposals: 16,
  modelTimeoutMs: 25000, toolTimeoutMs: 12000, runTimeoutMs: 80000, cacheFreshMs: 60000 } as const;
export const terminalStates = new Set<RunState>(['completed', 'partially_completed', 'failed', 'cancelled', 'waiting_for_input', 'awaiting_confirmation']);
const transitions: Record<RunState, readonly RunState[]> = {
  queued: ['planning', 'cancelled', 'failed'], planning: ['executing', 'observing', 'waiting_for_input', 'awaiting_confirmation', 'completed', 'partially_completed', 'failed', 'cancelled'],
  executing: ['observing', 'partially_completed', 'failed', 'cancelled'],
  observing: ['planning', 'executing', 'waiting_for_input', 'awaiting_confirmation', 'completed', 'partially_completed', 'failed', 'cancelled'],
  waiting_for_input: [], awaiting_confirmation: [], completed: [], partially_completed: [], failed: [], cancelled: [],
};

/** Credentials must not be copied into traces, model observations, or activity. */
export function safeText(value: string): string {
  let text = value.replace(/\b(?:sb_secret_[\w-]+|sk-[\w-]{12,}|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/g, '[redacted]');
  for (const name of ['SUPABASE_SECRET_KEY', 'CLOUDFLARE_API_TOKEN', 'OPENAI_API_KEY']) {
    const secret = process.env[name]; if (secret && secret.length >= 8) text = text.split(secret).join('[redacted]');
  }
  return text;
}
export function safeValue(value: unknown): unknown {
  if (typeof value === 'string') return safeText(value);
  if (Array.isArray(value)) return value.map(safeValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k,
    /(?:secret|password|token|api.?key|authorization)/i.test(k) ? '[redacted]' : safeValue(v)]));
  return value;
}
export function canonicalInput(value: unknown): string {
  const order = (v: unknown): unknown => Array.isArray(v) ? v.map(order) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, order(x)])) : v;
  return JSON.stringify(order(value));
}
export interface ToolObservation {
  id: string; tool: string; status: 'completed' | 'empty' | 'failed' | 'reused'; data?: ToolResult;
  provenance: Array<{ kind: string; recordIds: string[] }>; missingInformation: string[]; warnings: string[];
  error?: { code: string; message: string }; nextStepRequired: boolean;
}
export interface ExecutionCall {
  id: string; runId: string; taskId?: string; tool: string; canonicalTool?: string; version: string; step: number;
  input: unknown; validatedInput?: unknown; startedAt: string; endedAt?: string;
  status: 'running' | 'completed' | 'failed' | 'reused'; output?: ToolResult;
  error?: { code: string; message: string }; provenance: ToolObservation['provenance'];
}
export class ExecutionState {
  readonly started = Date.now();
  agent = 'discovery';
  state: RunState = 'queued'; calls: ExecutionCall[] = []; observations: ToolObservation[] = [];
  planningErrors: Array<{ code: string; message: string }> = [];
  warnings: string[] = []; iterations = 0; executions = 0; failures = 0;
  readonly cache = new Map<string, { output: ToolResult; at: number }>();
  constructor(readonly runId: string, readonly conversationId: string, readonly ownerId: string,
    readonly request: string, public goal: string, private readonly store: AgentStore) {}
  activity(): RunActivity { return activitySchema.parse({ runId: this.runId, state: this.state, updatedAt: new Date().toISOString(),
    steps: this.calls.map((c) => ({ id: c.id, number: c.step, label: label(c.tool), status: c.status,
      recordCount: c.output?.findings.length ?? 0, ...(c.error ? { error: c.error.message } : {}) })), warnings: this.warnings.slice(0, 8) }); }
  async persist(finalOutput?: unknown) {
    await this.store.saveExecutionState?.(this.runId, { version: '1', runId: this.runId, conversationId: this.conversationId,
      ownerId: this.ownerId, agent: this.agent, originalRequest: safeText(this.request), goal: safeText(this.goal), state: this.state,
      currentStep: this.calls.length, calls: safeValue(this.calls), observations: safeValue(this.observations),
      errors: [...this.planningErrors, ...this.calls.flatMap((c) => c.error ? [c.error] : [])],
      provenance: { request: { kind: 'user' }, results: this.observations.flatMap((o) => o.provenance) },
      warnings: this.warnings, startedAt: new Date(this.started).toISOString(), updatedAt: new Date().toISOString(),
      ...(terminalStates.has(this.state) ? { finishedAt: new Date().toISOString() } : {}), ...(finalOutput ? { finalOutput: { runId: this.runId, outputType: 'assistant_response' } } : {}) });
  }
  async transition(next: RunState) {
    if (next !== this.state && !transitions[this.state].includes(next)) throw new AgentError('RUN_STATE_INVALID', 'This run cannot continue.');
    this.state = next; await this.persist();
  }
  limit(tool: string): string | undefined {
    if (Date.now() - this.started >= AGENT_LIMITS.runTimeoutMs) return 'Execution time limit reached.';
    if (this.executions >= AGENT_LIMITS.maxToolCalls) return 'Tool call limit reached.';
    if (this.calls.length > AGENT_LIMITS.maxProposals) return 'Repeated proposals limit reached.';
    if (this.failures >= AGENT_LIMITS.maxFailures) return 'Failure recovery limit reached.';
    if (this.calls.filter((c) => (c.canonicalTool ?? c.tool) === tool && !['reused', 'running'].includes(c.status)).length >= AGENT_LIMITS.maxRepeatedToolCalls) return 'Repeated tool limit reached.';
  }
  begin(tool: string, version: string, input: unknown): ExecutionCall {
    const call: ExecutionCall = { id: randomUUID(), runId: this.runId, tool: /^[a-z_]{2,80}$/.test(safeText(tool)) ? safeText(tool) : 'unregistered_tool',
      version: /^[0-9]{1,3}$/.test(version) ? version : 'unsupported', step: this.calls.length + 1,
      input: safeValue(input), startedAt: new Date().toISOString(), status: 'running', provenance: [] };
    this.calls.push(call); return call;
  }
}
export function label(tool: string) {
  const known: Record<string, string> = { check_requirements: 'Check documented requirements', compare_providers: 'Compare sourced options',
    search_locations: 'Search catalog locations', request_user_information: 'Request missing information', request_external_action: 'Record action for review' };
  return known[tool] ?? `${tool.startsWith('search_') ? 'Search' : tool.startsWith('get_') ? 'Read' : 'Review'} ${tool.replace(/^(?:search_|get_)/, '').replaceAll('_', ' ')}`;
}
