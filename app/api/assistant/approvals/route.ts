import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AgentError } from '@/lib/agents/errors';
import { createAdminClient, createUserClient, isAgentConfigured, SupabaseCaseAccess, verifyUser } from '@/lib/agents/persistence';
import { toolSchemas } from '@/lib/agents/tools';

const requestSchema = z.object({ actionId: z.uuid(), decision: z.enum(['approved', 'rejected']) }).strict();

export async function POST(request: NextRequest) {
  if (!isAgentConfigured()) return NextResponse.json({ error: 'The assistant needs server configuration.' }, { status: 503 });
  try {
    const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
    if (!token) throw new AgentError('AUTH_REQUIRED', 'Sign in first.');
    const user = await verifyUser(token);
    const body = requestSchema.parse(await request.json());
    const admin = createAdminClient();
    const userDb = createUserClient(token);
    const actionQuery = await admin.from('agent_actions').select('id,run_id,task_id,tool_name,status,metadata').eq('id', body.actionId).maybeSingle();
    const action = actionQuery.data;
    if (actionQuery.error || !action || action.status !== 'proposed' || !action.task_id) throw new AgentError('APPROVAL_UNAVAILABLE', 'This approval is unavailable.');
    if (!['create_case', 'update_case', 'create_agent_task'].includes(action.tool_name ?? '')) throw new AgentError('APPROVAL_UNAVAILABLE', 'This action cannot be executed here.');
    const runQuery = await admin.from('agent_runs').select('conversation_id,case_id').eq('id', action.run_id).single();
    const run = runQuery.data;
    if (runQuery.error || !run?.conversation_id) throw new AgentError('APPROVAL_UNAVAILABLE', 'This approval is unavailable.');
    const conversation = await userDb.from('conversations').select('id').eq('id', run.conversation_id).eq('owner_id', user.id).maybeSingle();
    if (conversation.error || !conversation.data) throw new AgentError('APPROVAL_UNAVAILABLE', 'This approval is unavailable.');
    const approvalQuery = await admin.from('agent_approvals').select('id,decision').eq('action_id', action.id).maybeSingle();
    if (approvalQuery.error || approvalQuery.data?.decision !== 'pending') throw new AgentError('APPROVAL_UNAVAILABLE', 'This approval has already been decided.');
    const proposal = typeof action.metadata === 'object' && action.metadata !== null && !Array.isArray(action.metadata)
      ? action.metadata.proposal : undefined;
    const tool = action.tool_name as 'create_case' | 'update_case' | 'create_agent_task';
    const valid = toolSchemas[tool].safeParse(proposal);
    if (!valid.success) throw new AgentError('APPROVAL_UNAVAILABLE', 'The proposed action is invalid.');
    if (tool === 'update_case' && toolSchemas.update_case.parse(proposal).caseId !== run.case_id) throw new AgentError('APPROVAL_UNAVAILABLE', 'The proposed case does not match this run.');
    if (tool === 'update_case') await new SupabaseCaseAccess(userDb).readContext(run.case_id!);
    const now = new Date().toISOString();
    const decision = await admin.from('agent_approvals').update({ decision: body.decision, reviewer_id: user.id, decided_at: now })
      .eq('id', approvalQuery.data.id).eq('decision', 'pending').select('id').maybeSingle();
    if (decision.error || !decision.data) throw new AgentError('APPROVAL_UNAVAILABLE', 'This approval has already been decided.');
    if (body.decision === 'rejected') {
      await admin.from('agent_actions').update({ status: 'rejected' }).eq('id', action.id);
      await admin.from('agent_tasks').update({ status: 'blocked', completed_at: now }).eq('id', action.task_id);
      await admin.from('agent_runs').update({ status: 'cancelled' }).eq('id', action.run_id);
      return NextResponse.json({ status: 'rejected' });
    }
    await admin.from('agent_actions').update({ status: 'approved' }).eq('id', action.id);
    try {
      let caseId: string | undefined;
      if (tool === 'create_case') {
        const title = (valid.data as { title: string }).title;
        const result = await userDb.from('cases').insert({ owner_id: user.id, title }).select('id').single();
        if (result.error || !result.data) throw new Error('case insert failed');
        caseId = result.data.id;
      } else if (tool === 'update_case') {
        const input = valid.data as { caseId: string; title: string };
        const result = await userDb.from('cases').update({ title: input.title }).eq('id', input.caseId).eq('owner_id', user.id).select('id').maybeSingle();
        if (result.error || !result.data) throw new Error('case update failed');
        caseId = result.data.id;
      } else {
        const objective = (valid.data as { objective: string }).objective;
        const result = await admin.from('agent_tasks').update({ objective }).eq('id', action.task_id);
        if (result.error) throw new Error('task update failed');
      }
      await admin.from('agent_actions').update({ status: 'completed', performed_at: new Date().toISOString() }).eq('id', action.id);
      await admin.from('agent_tasks').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', action.task_id);
      await admin.from('agent_runs').update({ status: 'completed' }).eq('id', action.run_id);
      return NextResponse.json({ status: 'completed', caseId });
    } catch {
      await admin.from('agent_actions').update({ status: 'failed' }).eq('id', action.id);
      await admin.from('agent_tasks').update({ status: 'failed', error_code: 'APPROVED_ACTION_FAILED' }).eq('id', action.task_id);
      await admin.from('agent_runs').update({ status: 'failed', metadata: { errorCode: 'APPROVED_ACTION_FAILED' } }).eq('id', action.run_id);
      throw new AgentError('APPROVED_ACTION_FAILED', 'The approved action could not be completed.');
    }
  } catch (error) {
    const known = error instanceof AgentError ? error : new AgentError('INVALID_REQUEST', 'Invalid approval request.');
    return NextResponse.json({ error: known.publicMessage, code: known.code }, { status: known.code === 'AUTH_REQUIRED' ? 401 : 400 });
  }
}
