import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
vi.mock('server-only', () => ({}));

import { CloudflareProvider } from '@/lib/agents/cloudflare-provider';
import { runAgent } from '@/lib/agents/runtime';
import { createAdminClient, createUserClient, SupabaseAgentStore, SupabaseCaseAccess, verifyUser } from '@/lib/agents/persistence';
import { executeTool } from '@/lib/agents/tools';
import type { AgentStore } from '@/lib/agents/persistence';
import { toolResultSchema, type AgentResponse } from '@/lib/agents/schemas';

const ready = Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN
  && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const persistenceReady = Boolean(ready && process.env.SUPABASE_SECRET_KEY && process.env.RUN_REMOTE_PERSISTENCE_TEST === '1');
const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

class LiveStore implements AgentStore {
  private counter = 0;
  actions: string[] = [];
  output?: AgentResponse;
  async createConversation() { return id(1); }
  async assertConversation() { /* not used in this test */ }
  async addMessage() { /* not used in this test */ }
  async startRun() { return id(2); }
  async createTask() { return id(++this.counter + 10); }
  async updateTask() { /* inspected via response */ }
  async recordAction(_runId: string, _taskId: string, tool: string, status: string) { this.actions.push(`${tool}:${status}`); return undefined; }
  async saveOutput(_runId: string, response: AgentResponse) { this.output = response; }
  async finishRun() { /* inspected via response */ }
}

it.skipIf(!ready)('reads a real package through the approved tool', async () => {
  const result = await executeTool('search_packages', { query: 'knee replacement India' }, {
    agent: 'discovery', userId: id(3), caseAccess: { readContext: async () => ({}), readDocumentMetadata: async () => [] },
  });
  expect(result.findings.length).toBeGreaterThan(0);
  expect(() => toolResultSchema.parse(result)).not.toThrow();
}, 30000);

it.skipIf(!ready)('reads real Mumbai hospitals through the approved tool', async () => {
  const result = await executeTool('search_hospitals', { query: 'knee replacement', city: 'mumbai', treatment: 'knee-replacement', verification: 'demo' }, {
    agent: 'discovery', userId: id(3), caseAccess: { readContext: async () => ({}), readDocumentMetadata: async () => [] },
  });
  expect(result.findings.length).toBeGreaterThan(0);
  expect(() => toolResultSchema.parse(result)).not.toThrow();
}, 30000);

it.skipIf(!ready)('reads a seeded India cardiology clinician through the approved tool', async () => {
  const result = await executeTool('search_doctors', { query: 'cardiologist in India', country: 'india', specialty: 'Cardiology' }, {
    agent: 'discovery', userId: id(3), caseAccess: { readContext: async () => ({}), readDocumentMetadata: async () => [] },
  });
  expect(result.findings.length).toBeGreaterThan(0);
  expect(() => toolResultSchema.parse(result)).not.toThrow();
}, 30000);

it.skipIf(!ready)('Cloudflare plans real Supabase hospital and package searches', async () => {
  const store = new LiveStore();
  const response = await runAgent({ content: 'Find knee replacement hospitals in Mumbai and show relevant packages.' }, {
    userId: id(3), store, provider: new CloudflareProvider(),
    caseAccess: { readContext: async () => { throw new Error('case access denied'); }, readDocumentMetadata: async () => [] },
  });
  expect(response.status, JSON.stringify({ summary: response.summary, actions: store.actions, tasks: response.tasks })).toBe('completed');
  expect(store.actions).toContain('search_hospitals:completed');
  expect(store.actions).toContain('search_packages:completed');
  expect(response.findings.some((finding) => finding.kind === 'hospitals' && finding.facts.city === 'Mumbai')).toBe(true);
  expect(response.findings.some((finding) => finding.kind === 'packages')).toBe(true);
  expect(response.findings.every((finding) => finding.provenance.sourceKind === 'synthetic')).toBe(true);
}, 180000);

it.skipIf(!ready)('Cloudflare chooses doctor search over the real Supabase catalog', async () => {
  const store = new LiveStore();
  const response = await runAgent({ content: 'I need a cardiologist in India.' }, {
    userId: id(3), store, provider: new CloudflareProvider(),
    caseAccess: { readContext: async () => { throw new Error('case access denied'); }, readDocumentMetadata: async () => [] },
  });
  expect(response.status, JSON.stringify({ summary: response.summary, actions: store.actions })).toBe('completed');
  expect(store.actions).toContain('search_doctors:completed');
  expect(response.findings.some((finding) => finding.kind === 'doctors' && finding.provenance.sourceKind === 'synthetic')).toBe(true);
}, 180000);

it.skipIf(!ready)('Cloudflare asks for the missing surgery type', async () => {
  const store = new LiveStore();
  const response = await runAgent({ content: 'Find a hospital for surgery.' }, {
    userId: id(3), store, provider: new CloudflareProvider(),
    caseAccess: { readContext: async () => { throw new Error('case access denied'); }, readDocumentMetadata: async () => [] },
  });
  expect(response.status, JSON.stringify({ summary: response.summary, actions: store.actions })).toBe('awaiting_user_input');
  expect(response.question).toMatch(/surgery|treatment|procedure/i);
}, 180000);

it.skipIf(!persistenceReady)('persists a real model and tool run to the remote Supabase workspace', async () => {
  const admin = createAdminClient();
  const email = `medbridge-test-${randomUUID()}@example.invalid`;
  const password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error('Could not create temporary test user');
  const userId = created.data.user.id;
  let conversationId: string | undefined;
  let runId: string | undefined;
  try {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) throw new Error('Could not sign in temporary test user');
    const token = signedIn.data.session.access_token;
    expect((await verifyUser(token)).id).toBe(userId);
    const userDb = createUserClient(token);
    const response = await runAgent({ content: 'Find knee replacement hospitals in Mumbai.' }, {
      userId, provider: new CloudflareProvider(), store: new SupabaseAgentStore(admin, userDb),
      caseAccess: new SupabaseCaseAccess(userDb),
    });
    conversationId = response.conversationId;
    runId = response.runId;
    expect(response.status, response.summary).toBe('completed');
    expect(response.findings.some((finding) => finding.kind === 'hospitals')).toBe(true);
    const [conversation, messages, run, tasks, actions, outputs] = await Promise.all([
      admin.from('conversations').select('id').eq('id', conversationId).single(),
      admin.from('conversation_messages').select('role').eq('conversation_id', conversationId),
      admin.from('agent_runs').select('status').eq('id', runId).single(),
      admin.from('agent_tasks').select('status').eq('run_id', runId),
      admin.from('agent_actions').select('tool_name').eq('run_id', runId),
      admin.from('agent_outputs').select('content,source_record_ids').eq('run_id', runId),
    ]);
    expect(conversation.data?.id).toBe(conversationId);
    expect(messages.data?.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(run.data?.status).toBe('completed');
    expect(tasks.data?.some((task) => task.status === 'completed')).toBe(true);
    expect(actions.data?.some((action) => action.tool_name === 'search_hospitals')).toBe(true);
    expect(outputs.data?.length).toBe(1);
  } finally {
    if (runId) {
      await admin.from('agent_outputs').delete().eq('run_id', runId);
      await admin.from('agent_actions').delete().eq('run_id', runId);
      await admin.from('agent_tasks').delete().eq('run_id', runId);
      await admin.from('agent_runs').delete().eq('id', runId);
    }
    if (conversationId) {
      await admin.from('conversation_messages').delete().eq('conversation_id', conversationId);
      await admin.from('conversations').delete().eq('id', conversationId);
    }
    await admin.auth.admin.deleteUser(userId);
  }
}, 180000);
