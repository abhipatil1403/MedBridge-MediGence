import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { AgentError } from '@/lib/agents/errors';
import { createAdminClient, createUserClient, SupabaseAgentStore, SupabaseCaseAccess, verifyUser } from '@/lib/agents/persistence';
import { SupabasePlanningStore } from '@/lib/agents/treatment-planning/store';
import { taskActionSchema, updatePlanningTask } from '@/lib/agents/treatment-planning/task-actions';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
    if (!token) throw new AgentError('AUTH_REQUIRED', 'Sign in to update your plan.');
    const user = await verifyUser(token);
    const parsed = taskActionSchema.safeParse(await request.json());
    if (!parsed.success) throw new AgentError('INVALID_REQUEST', 'Choose a valid planning task.');
    const input = parsed.data;
    const userDb = createUserClient(token), admin = createAdminClient();
    await new SupabaseAgentStore(admin, userDb).assertConversation(input.conversationId, user.id, input.caseId);
    if (input.caseId) await new SupabaseCaseAccess(userDb).readContext(input.caseId);
    const store = new SupabasePlanningStore(admin, userDb), lease = randomUUID();
    if (!await store.acquire(input.conversationId, user.id, lease)) throw new AgentError('TURN_IN_PROGRESS', 'Wait for the current request to finish before updating the plan.');
    try { return NextResponse.json({ plan: await updatePlanningTask(input, user.id, store, lease) }); }
    finally { await store.release(input.conversationId, lease); }
  } catch (error) {
    const failure = error instanceof AgentError ? error : new AgentError('REQUEST_FAILED', 'The planning task could not be updated.');
    return NextResponse.json({ error: failure.publicMessage }, { status: failure.code === 'AUTH_REQUIRED' ? 401 : failure.code.includes('DENIED') ? 403 : 400 });
  }
}
