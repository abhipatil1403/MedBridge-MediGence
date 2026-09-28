import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AgentError } from '@/lib/agents/errors';
import { createUserClient, isAgentConfigured, verifyUser } from '@/lib/agents/persistence';

export async function POST(request: NextRequest) {
  if (!isAgentConfigured()) return NextResponse.json({ error: 'The assistant needs server configuration.' }, { status: 503 });
  try {
    const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
    if (!token) throw new AgentError('AUTH_REQUIRED', 'Sign in first.');
    const user = await verifyUser(token);
    const body = z.object({ caseId: z.uuid(), decision: z.enum(['granted', 'revoked']) }).strict().parse(await request.json());
    const db = createUserClient(token);
    const caseQuery = await db.from('cases').select('id,owner_id').eq('id', body.caseId).maybeSingle();
    if (caseQuery.error || !caseQuery.data || caseQuery.data.owner_id !== user.id) throw new AgentError('CASE_ACCESS_DENIED', 'Only the case owner can change assistant consent.');
    const now = new Date().toISOString();
    const result = await db.from('consents').insert({ case_id: body.caseId, subject_id: user.id,
      consent_type: 'agent_case_processing', purpose: 'Use case information for MedBridge assistant coordination',
      decision: body.decision, granted_at: body.decision === 'granted' ? now : null,
      revoked_at: body.decision === 'revoked' ? now : null, version: '1', source: 'assistant_workspace' });
    if (result.error) throw new AgentError('DATABASE_FAILURE', 'Consent could not be saved.');
    return NextResponse.json({ success: true });
  } catch (error) {
    const known = error instanceof AgentError ? error : new AgentError('INVALID_REQUEST', 'Invalid consent request.');
    return NextResponse.json({ error: known.publicMessage }, { status: known.code === 'AUTH_REQUIRED' ? 401 : 400 });
  }
}
