import {NextRequest} from 'next/server';
import {z} from 'zod';
import {portalSession,portalResponse,portalFailure,PortalError} from '@/lib/portals/server';
import {deletionRpc,completeDeletion} from '@/lib/documents/deletion';
import {createAdminClient} from '@/lib/agents/persistence';
import {AgentError} from '@/lib/agents/errors';
export const runtime='nodejs';
async function session(request:NextRequest){const c=await portalSession(request);if(c.portal!=='admin'||c.context.role!=='super_admin')throw new PortalError(403,'Cleanup recovery requires a Super Admin.');return c;}
export async function GET(request:NextRequest){try{const c=await session(request);return portalResponse(await deletionRpc(c.db,'document_deletion_queue'));}catch(e){return portalFailure(e);}}
// Retry only a persisted owner-authorized request; this cannot initiate deletion.
export async function POST(request:NextRequest){try{await session(request);const body=z.object({id:z.uuid(),confirmed:z.literal(true)}).strict().parse(await request.json());return portalResponse(await completeDeletion(createAdminClient(),body.id));}catch(e){return portalFailure(e instanceof AgentError?new PortalError(409,e.publicMessage):e);}}
