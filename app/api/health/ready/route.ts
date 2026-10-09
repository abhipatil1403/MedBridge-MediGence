import { NextRequest, NextResponse } from 'next/server';
import { portalSession, portalFailure, PortalError } from '@/lib/portals/server';
import { readiness } from '@/lib/operations/server';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    let timer:ReturnType<typeof setTimeout>|undefined;
    const session = await Promise.race([portalSession(request), new Promise<never>((_, reject) => {timer=setTimeout(() => reject(new PortalError(503, 'Readiness authentication is temporarily unavailable.')), 5000);})]).finally(()=>{if(timer)clearTimeout(timer);});
    if (!['admin','super_admin'].includes(session.context.role ?? '')) throw new PortalError(403, 'Administrator access is required.');
    const result = await readiness(session.db);
    return NextResponse.json(result, {status: result.status === 'ready' ? 200 : 503, headers: {'Cache-Control': 'private, no-store'}});
  } catch (error) { return portalFailure(error); }
}
