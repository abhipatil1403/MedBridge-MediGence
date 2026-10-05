import 'server-only';
import type { NextRequest } from 'next/server';
import { createUserClient, verifyUser } from '@/lib/agents/persistence';
import { AgentError } from '@/lib/agents/errors';
import { NextResponse } from 'next/server';
import { portalFailure } from '@/lib/portals/server';
export async function experienceSession(request: NextRequest) {
  const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) throw new AgentError('AUTH_REQUIRED', 'Sign in to continue.');
  const user = await verifyUser(token);
  return { user, db: createUserClient(token) };
}
export function experienceFailure(error:unknown){
 if(error instanceof AgentError)return NextResponse.json({error:error.publicMessage},{status:error.code==='AUTH_REQUIRED'?401:403,headers:{'Cache-Control':'no-store'}});
 return portalFailure(error);
}
