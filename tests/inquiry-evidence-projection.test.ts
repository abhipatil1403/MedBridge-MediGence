import {it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server';
vi.mock('server-only',()=>({}));
const {session}=vi.hoisted(()=>({session:vi.fn()}));
vi.mock('@/lib/portals/server',async importOriginal=>({...await importOriginal<typeof import('@/lib/portals/server')>(),portalSession:session}));
import {effectiveProviderStatus,projectInquiryContext,providerStatusLabel,providerQueueStatusLabel,type InquiryContext} from '@/lib/inquiries/schemas';
import {readOwnInquiries} from '@/lib/inquiries/server';
import {GET} from '@/app/api/inquiries/route';
import type {Database} from '@/types/database';
import type {SupabaseClient} from '@supabase/supabase-js';
const owner=randomUUID(),id=randomUUID();
function context():InquiryContext {
  return {role:'patient',case:{id,title:'QA coordination',status:'in_progress',share_with_provider:true,provider_response_status:'accepted_for_coordination',updated_at:new Date().toISOString(),entity_snapshot:{kind:'hospital',name:'QA listing',href:'/hospitals/qa-listing'}},organization:{id:randomUUID(),name:'QA organization'},providerCoordination:{available:true,latestResponse:null,informationRequestedAt:null,informationAnsweredAt:null},documentRequests:[]} as unknown as InquiryContext;
}
function database(raw:InquiryContext){
  const query={select:()=>query,eq:()=>query,neq:()=>query,order:()=>query,limit:()=>query,maybeSingle:async()=>({data:{id},error:null}),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:[{id}],error:null}).then(resolve)};
  return {from:()=>query,rpc:async()=>({data:raw,error:null})} as unknown as SupabaseClient<Database>;
}
it('projects an unconfirmed status without altering persisted evidence or audit history',()=>{
  const raw=context(),projected=projectInquiryContext(raw);
  expect(projected.case.provider_response_status).toBe('unconfirmed_response');expect(raw.case.provider_response_status).toBe('accepted_for_coordination');
  expect(providerStatusLabel(effectiveProviderStatus(raw))).toBe('Provider response not confirmed');
  expect(providerQueueStatusLabel('accepted_for_coordination')).not.toContain('confirmed it can');
});
it.each([null,{id:'invalid',body:'A recorded reply.'},{id:randomUUID(),body:' '}])('rejects missing or unusable response evidence %j',response=>{
  const raw=context();raw.providerCoordination!.latestResponse=response as NonNullable<InquiryContext['providerCoordination']>['latestResponse'];
  expect(effectiveProviderStatus(raw)).toBe('unconfirmed_response');
});
it('preserves genuine projected responses and pending information replies',()=>{
  const raw=context();raw.providerCoordination!.latestResponse={id:randomUUID(),body:'QA authorized organization can continue coordination.',createdAt:new Date().toISOString(),responderName:'QA representative',organizationName:raw.organization!.name};
  expect(projectInquiryContext(raw).case.provider_response_status).toBe('accepted_for_coordination');
  raw.case.provider_response_status='pending';expect(effectiveProviderStatus(raw)).toBe('pending');
});
it('the inquiry API requires response evidence and keeps the response private',async()=>{
  const raw=context();session.mockResolvedValue({user:{id:owner},db:database(raw),portal:'patient'});
  const result=await GET(new NextRequest(`http://localhost/api/inquiries?id=${id}`));
  expect(result.status).toBe(200);expect(result.headers.get('cache-control')).toBe('private, no-store');
  expect((await result.json()).case.provider_response_status).toBe('unconfirmed_response');expect(raw.case.provider_response_status).toBe('accepted_for_coordination');
});
it('the owner-scoped AI projection cannot claim acceptance from a status alone',async()=>{
  const result=await readOwnInquiries(database(context()),owner,id);
  expect(result.requests[0].providerStatus).toBe('unconfirmed_response');expect(result.requests[0].nextStep).toContain('No attributable provider response');
});
