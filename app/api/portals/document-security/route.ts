import {NextRequest} from 'next/server';
import {z} from 'zod';
import {portalSession,portalResponse,portalFailure,PortalError} from '@/lib/portals/server';
import {securityRpc} from '@/lib/documents/security';
export const runtime='nodejs';
async function session(request:NextRequest){const c=await portalSession(request);if(c.portal!=='admin'||c.context.role!=='super_admin')throw new PortalError(403,'Security review requires a Super Admin.');return c;}
export async function GET(request:NextRequest){try{const c=await session(request);return portalResponse(await securityRpc(c.db,'document_security_review'));}catch(e){return portalFailure(e);}}
export async function POST(request:NextRequest){try{const c=await session(request);const body=z.object({id:z.uuid(),confirmed:z.literal(true)}).strict().parse(await request.json());return portalResponse(await securityRpc(c.db,'document_security_review',{p_id:body.id,p_retry:true,p_confirmed:body.confirmed}));}catch(e){return portalFailure(e);}}
