import 'server-only';
import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { createUserClient, verifyUser } from '@/lib/agents/persistence';
import { portalAllowed, portalSchema, type PortalContext } from './config';

export class PortalError extends Error {
  constructor(public readonly status:number,public readonly publicMessage:string) {super(publicMessage);}
}
const messages:Record<string,string> = {
  PORTAL_CONFLICT:'This record changed since you opened it. Reload before saving.',
  PORTAL_DENIED:'You do not have access to this operation.',
  PORTAL_RECORD_LOCKED:'This revision is under review. Wait for a review decision before editing.',
  PORTAL_PROFILE_REQUIRED:'Complete the required organization profile fields before submitting.',
  PORTAL_PACKAGE_REQUIRED:'Add a treatment, description, price, currency and duration before submitting.',
  PORTAL_EVIDENCE_REQUIRED:'Approved, current evidence is required for this action.',
  PORTAL_EVIDENCE_EXPIRED:'This evidence has expired. Upload current evidence.',
  PORTAL_REVIEW_UNRESOLVED:'Resolve conflicting, rejected or stale field reviews before publishing.',
  PORTAL_LAST_ADMIN:'Keep at least one active administrator.',
  PORTAL_NOTHING_TO_SUBMIT:'There are no draft changes to submit.',
  PORTAL_CONSENT_REQUIRED:'Patient consent is required for this action.',
  PORTAL_TRANSITION_INVALID:'This action is unavailable in the current status.',
  PORTAL_REVIEW_REASON_REQUIRED:'Add a clear reason for the review decision or escalation.',
  PORTAL_SYNTHETIC_NOT_VERIFIABLE:'Synthetic content cannot be marked as verified.',
  PORTAL_REFERENCED_CONTENT:'Published records still reference this content. Update those records first.',
  PORTAL_USE_PROVIDER_WORKFLOW:'Manage this provider listing through its reviewed submission workflow.',
  PORTAL_INVITE_INVALID:'This invitation is unavailable, expired, or belongs to a different email address.',
};
export function checked<T>(result:{data:T|null;error:{message:string}|null}):NonNullable<T> {
  if(result.error||result.data===null) {
    const code=Object.keys(messages).find(key=>result.error?.message.includes(key));
    throw new PortalError(code==='PORTAL_DENIED'?403:400,code?messages[code]:"We couldn't save or load this change. Please try again.");
  }
  return result.data as NonNullable<T>;
}
export async function portalSession(request:NextRequest) {
  const portal=portalSchema.parse(request.nextUrl.searchParams.get('portal')??'patient');
  const token=/^Bearer (.+)$/.exec(request.headers.get('authorization')??'')?.[1];
  if(!token) throw new PortalError(401,'Sign in to continue.');
  let user;
  try {user=await verifyUser(token);} catch {throw new PortalError(401,'Sign in to continue.');}
  const db=createUserClient(token);
  const context=checked(await db.rpc('portal_context',{})) as unknown as PortalContext;
  if(!portalAllowed(portal,context.role)) throw new PortalError(403,'This portal requires an assigned staff role.');
  return {portal,token,user,db,context:{...context,email:user.email}};
}
export function portalResponse(data:unknown) {return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});}
export function portalFailure(error:unknown) {
  if(error instanceof PortalError) return NextResponse.json({error:error.publicMessage},{status:error.status,headers:{'Cache-Control':'no-store'}});
  return NextResponse.json({error:error instanceof z.ZodError?'Check the form fields and try again.':"We couldn't complete this request. Please try again."},{status:400,headers:{'Cache-Control':'no-store'}});
}
