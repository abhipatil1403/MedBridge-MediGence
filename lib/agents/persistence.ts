import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database';
import { AgentError } from './errors';
import type { AgentId, AgentResponse, AgentTaskView, ToolName, ToolResult } from './schemas';
import type { CaseAccess } from './tools';
import { agentIdSchema } from './schemas';
import { activitySchema } from './execution-schemas';
import { safeValue } from './execution-state';
import { documentWorkspaceSchema } from '@/lib/documents/schemas';

type Db = SupabaseClient<Database>;
function checked<T>(data: T | null, error: { message: string } | null): T {
  if (error || data === null) throw new AgentError('DATABASE_FAILURE', 'The workspace could not save this step. Please try again.');
  return data;
}
function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !publicKey || !secret) throw new AgentError('CONFIGURATION_MISSING', 'The assistant needs server configuration before it can run.');
  return { url, publicKey, secret };
}
export function isAgentConfigured() {
  return Boolean(process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
export function createUserClient(token: string): Db {
  const { url, publicKey } = config();
  return createClient<Database>(url, publicKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function createAdminClient(): Db {
  const { url, secret } = config();
  return createClient<Database>(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function verifyUser(token: string): Promise<{ id: string; email?: string }> {
  const db = createUserClient(token);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new AgentError('AUTH_REQUIRED', 'Sign in to use the care workspace.');
  return { id: data.user.id, email: data.user.email };
}

export class SupabaseCaseAccess implements CaseAccess {
  constructor(private readonly db: Db) {}

  private async authorizedCase(caseId: string) {
    const { data, error } = await this.db.from('cases').select('id,owner_id,title,status,preferred_country_id,preferred_city_id,preferred_treatment_id').eq('id', caseId).maybeSingle();
    if (error || !data) throw new AgentError('CASE_ACCESS_DENIED', 'This case is unavailable to your account.');
    const { data: consent, error: consentError } = await this.db.from('consents')
      .select('decision').eq('case_id', caseId).eq('subject_id', data.owner_id)
      .eq('consent_type', 'agent_case_processing').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (consentError || consent?.decision !== 'granted') throw new AgentError('CASE_CONSENT_REQUIRED', 'Grant case processing consent before the assistant reads this case.');
    return data;
  }

  async readContext(caseId: string): Promise<Record<string, unknown>> {
    const data = await this.authorizedCase(caseId);
    const city = data.preferred_city_id ? await this.db.from('cities').select('name').eq('id', data.preferred_city_id).maybeSingle() : undefined;
    if (city?.error) throw new AgentError('DATABASE_FAILURE', 'Case preferences are temporarily unavailable.');
    return { caseId: data.id, title: data.title, status: data.status,
      preferredCountryId: data.preferred_country_id, preferredCityId: data.preferred_city_id,
      preferredTreatmentId: data.preferred_treatment_id, preferredCity: city?.data?.name };
  }

  async readDocumentMetadata(caseId: string): Promise<Record<string, unknown>[]> {
    await this.authorizedCase(caseId);
    const { data, error } = await this.db.from('case_documents').select('id,title,document_type,status,created_at').eq('case_id', caseId).limit(20);
    if (error) throw new AgentError('DATABASE_FAILURE', 'Document metadata is temporarily unavailable.');
    return (data ?? []).map((item) => ({ id: item.id, title: item.title, type: item.document_type, status: item.status, createdAt: item.created_at }));
  }
}

export interface AgentStore {
  saveExecutionState?(runId: string, state: Record<string, unknown>): Promise<void>;
  createConversation(userId: string, caseId?: string): Promise<string>;
  assertConversation(conversationId: string, userId: string, caseId?: string): Promise<void>;
  addMessage(conversationId: string, role: 'user' | 'assistant', content: string, runId?: string, metadata?: Record<string, unknown>): Promise<void>;
  startRun(conversationId: string, userId: string, agent: AgentId, caseId?: string, carePlanId?: string): Promise<string>;
  createTask(runId: string, agent: AgentId, objective: string, tool: ToolName, caseId?: string, carePlanTaskId?: string): Promise<string>;
  updateTask(taskId: string, status: AgentTaskView['status'], errorCode?: string, output?: ToolResult): Promise<void>;
  recordAction(runId: string, taskId: string, tool: ToolName, status: 'completed' | 'failed' | 'proposed', durationMs: number, input: unknown, output?: ToolResult, errorCode?: string): Promise<string | undefined>;
  saveOutput(runId: string, response: AgentResponse): Promise<void>;
  finishRun(runId: string, status: AgentResponse['status'], errorCode?: string, diagnostics?: Record<string, string | boolean | null>): Promise<void>;
}

export class SupabaseAgentStore implements AgentStore {
  constructor(private readonly admin: Db, private readonly userDb: Db) {}

  async createConversation(userId: string, caseId?: string) {
    const { data, error } = await this.admin.from('conversations').insert({ owner_id: userId, case_id: caseId ?? null }).select('id').single();
    return checked(data, error).id;
  }
  async assertConversation(conversationId: string, userId: string, caseId?: string) {
    const { data, error } = await this.userDb.from('conversations').select('id,case_id').eq('id', conversationId).eq('owner_id', userId).maybeSingle();
    if (error || !data || (data.case_id ?? undefined) !== caseId) throw new AgentError('CONVERSATION_ACCESS_DENIED', 'This conversation is unavailable.');
  }
  async addMessage(conversationId: string, role: 'user' | 'assistant', content: string, runId?: string, metadata: Record<string, unknown> = {}) {
    const { error } = await this.admin.from('conversation_messages').insert({ conversation_id: conversationId, run_id: runId ?? null, role, visibility: 'user', content, metadata: JSON.parse(JSON.stringify(metadata)) as Json });
    if (error) throw new AgentError('DATABASE_FAILURE', 'The conversation could not be saved.');
    const touch = await this.admin.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
    if (touch.error) throw new AgentError('DATABASE_FAILURE', 'The conversation could not be updated.');
  }
  async startRun(conversationId: string, userId: string, agent: AgentId, caseId?: string, carePlanId?: string) {
    const trace = randomUUID();
    const { data, error } = await this.admin.from('agent_runs').insert({
      conversation_id: conversationId, initiated_by: userId, case_id: caseId ?? null,
      agent_name: agent, agent_version: '1', purpose: 'care_coordination', status: 'running',
      started_at: new Date().toISOString(), trace_id: trace,
      ...(carePlanId ? { care_plan_id: carePlanId } : {}),
    }).select('id').single();
    const id = checked(data, error).id;
    await this.admin.from('conversations').update({ title: `${agent.replaceAll('_', ' ')} workspace` }).eq('id', conversationId).eq('title', 'New care workspace');
    console.info(JSON.stringify({ event: 'agent_run_started', runId: id, agent, trace }));
    return id;
  }
  async createTask(runId: string, agent: AgentId, objective: string, tool: ToolName, caseId?: string, carePlanTaskId?: string) {
    const { data, error } = await this.admin.from('agent_tasks').insert({ run_id: runId, case_id: caseId ?? null,
      task_type: agent, objective, tool_name: tool, status: 'pending', input_summary: {},
      ...(carePlanTaskId ? { care_plan_task_id: carePlanTaskId } : {}) }).select('id').single();
    return checked(data, error).id;
  }
  async updateTask(taskId: string, status: AgentTaskView['status'], errorCode?: string, output?: ToolResult) {
    const update = { status, error_code: errorCode ?? null,
      ...(status === 'running' ? { started_at: new Date().toISOString() } : {}),
      ...(['completed', 'failed', 'blocked'].includes(status) ? { completed_at: new Date().toISOString() } : {}),
      ...(output ? { output_summary: { count: output.findings.length, recordIds: output.findings.map((item) => item.provenance.recordId) } } : {}),
    };
    const { error } = await this.admin.from('agent_tasks').update(update).eq('id', taskId);
    if (error) throw new AgentError('DATABASE_FAILURE', 'Task progress could not be saved.');
  }
  async recordAction(runId: string, taskId: string, tool: ToolName, status: 'completed' | 'failed' | 'proposed', durationMs: number, input: unknown, output?: ToolResult, errorCode?: string) {
    const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
    const { data, error } = await this.admin.from('agent_actions').insert({
      run_id: runId, task_id: taskId, action_name: tool, tool_name: tool, tool_version: '1', status,
      input_hash: hash(input), output_hash: output ? hash(output) : null, requires_approval: status === 'proposed',
      performed_at: status === 'completed' ? new Date().toISOString() : null,
      metadata: { durationMs, errorCode: errorCode ?? null, resultCount: output?.findings.length ?? 0,
        ...(status === 'proposed' && ['create_case', 'update_case', 'create_agent_task'].includes(tool) ? { proposal: input as Record<string, string> } : {}) },
    }).select('id').single();
    const id = checked(data, error).id;
    if (status === 'proposed') {
      const approval = await this.admin.from('agent_approvals').insert({ action_id: id, decision: 'pending' });
      if (approval.error) throw new AgentError('DATABASE_FAILURE', 'The approval request could not be saved.');
    }
    console.info(JSON.stringify({ event: 'agent_tool', runId, taskId, tool, status, durationMs, errorCode }));
    return status === 'proposed' ? id : undefined;
  }
  async saveOutput(runId: string, response: AgentResponse) {
    const existing = await this.admin.from('agent_outputs').select('id').eq('run_id', runId).eq('output_type', 'assistant_response').limit(1).maybeSingle();
    if (existing.error) throw new AgentError('DATABASE_FAILURE', 'The assistant result could not be saved.');
    const output = { run_id: runId, output_type: 'assistant_response', content: JSON.parse(JSON.stringify(response)),
      source_record_ids: [...new Set(response.findings.map((item) => item.provenance.sourceRecordId).filter((id): id is string => Boolean(id)))],
    };
    // The existing conversation lease and unique runtime ID serialize this writer.
    // Retrying finalization updates its row instead of duplicating an already saved result.
    const { error } = existing.data ? await this.admin.from('agent_outputs').update(output).eq('id', existing.data.id).eq('run_id', runId)
      : await this.admin.from('agent_outputs').insert(output);
    if (error) throw new AgentError('DATABASE_FAILURE', 'The assistant result could not be saved.');
  }
  async saveExecutionState(runId: string, state: Record<string, unknown>) {
    const existing = await this.admin.from('agent_runs').select('metadata').eq('id', runId).single();
    const data = checked(existing.data, existing.error);
    const metadata = data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata) ? data.metadata : {};
    const result = await this.admin.from('agent_runs').update({ ...(agentIdSchema.safeParse(state.agent).success ? { agent_name: String(state.agent) } : {}), metadata: { ...metadata, execution: JSON.parse(JSON.stringify(safeValue(state))) as Json } }).eq('id', runId);
    if (result.error) throw new AgentError('DATABASE_FAILURE', 'Run progress could not be saved.');
  }
  async readActivity(conversationId: string, userId: string, caseId?: string) {
    await this.assertConversation(conversationId, userId, caseId);
    const result = await this.admin.from('agent_runs').select('id,metadata').eq('conversation_id', conversationId).eq('initiated_by', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw new AgentError('DATABASE_FAILURE', 'Run progress is temporarily unavailable.');
    const metadata = result.data?.metadata;
    const execution = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata.execution : undefined;
    if (!execution || typeof execution !== 'object' || Array.isArray(execution)) return undefined;
    // Return a small allowlisted projection. Raw inputs/results and private errors never reach this endpoint.
    const calls = Array.isArray(execution.calls) ? execution.calls : [];
    const parsed = activitySchema.safeParse({ runId: result.data!.id, state: execution.state, updatedAt: execution.updatedAt,
      steps: calls.map((raw) => {
        const c = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        const output = c.output && typeof c.output === 'object' && !Array.isArray(c.output) ? c.output : {};
        const documents = documentWorkspaceSchema.safeParse(output.documents);
        const ownedDocuments = documents.success && documents.data.ownerId===userId && documents.data.conversationId===conversationId ? documents.data : undefined;
        return { id: c.id, number: c.step, label: typeof c.tool === 'string' ? c.tool.replaceAll('_', ' ') : 'Catalog operation',
          status: c.status, recordCount: ownedDocuments ? c.tool==='get_document_requirements' ? ownedDocuments.requirements.length : ownedDocuments.documents.filter(d=>d.uploadStatus==='uploaded').length
            : Array.isArray(output.findings) ? output.findings.length : 0,
          ...(c.status === 'failed' ? { error: execution.agent==='document_coordination' ? 'This document operation could not be completed.' : 'This catalog operation could not be completed.' } : {}) };
      }), warnings: execution.warnings });
    return parsed.success ? parsed.data : undefined;
  }
  async finishRun(runId: string, status: AgentResponse['status'], errorCode?: string, diagnostics?: Record<string, string | boolean | null>) {
    const existing = await this.admin.from('agent_runs').select('metadata').eq('id', runId).single();
    const saved = checked(existing.data, existing.error);
    const metadata = saved.metadata && typeof saved.metadata === 'object' && !Array.isArray(saved.metadata) ? saved.metadata : {};
    const { error } = await this.admin.from('agent_runs').update({ status, finished_at: new Date().toISOString(), metadata: { ...metadata, ...diagnostics, ...(errorCode ? { errorCode } : {}) } }).eq('id', runId);
    if (error) throw new AgentError('DATABASE_FAILURE', 'The agent run could not be finalized.');
    console.info(JSON.stringify({ event: 'agent_run_finished', runId, status, errorCode }));
  }
}
