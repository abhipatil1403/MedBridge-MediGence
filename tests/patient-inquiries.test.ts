import { describe,it,expect,vi } from 'vitest';
vi.mock('server-only',()=>({}));
import { randomUUID } from 'node:crypto';
import { inquiryCommandSchema,inquiryNextStep,providerStatusLabel,type InquiryContext } from '@/lib/inquiries/schemas';
import { inquiryIntent,inquiryAgentSchema,type InquiryAgentContext } from '@/lib/inquiries/agent';
import { executeTool,toolRegistry } from '@/lib/agents/tools';
import { validateUpload } from '@/lib/documents/coordination';
import { harness,tools,unavailable,userId,snapshot,hospital } from './fixtures/comparison-harness';
const caseId=randomUUID(),otherId=randomUUID();
const context:InquiryAgentContext={selectedId:caseId,requests:[{id:caseId,title:'Coordination question',status:'waiting_patient',providerStatus:'not_requested',updatedAt:new Date().toISOString(),supportConsentActive:true,providerAuthorized:false,linkedListing:{kind:'hospital',name:'Published listing',href:'/hospitals/published-listing'},outstanding:[{title:'Coordination summary',purpose:'Answer this administrative question.',status:'requested'}]}]};
const create={action:'create',input:{operationId:randomUUID(),entityKind:'hospital',entityId:randomUUID(),expectedPublishedRevision:1,source:'hospital_detail',title:'Assistance request',objective:'Clarify this coordination question.',consent:true,reviewed:true}};
describe('reviewed inquiry inputs',()=>{
  it('requires explicit confirmation of operational acceptance',()=>expect(inquiryCommandSchema.safeParse({action:'provider_response',input:{operationId:randomUUID(),caseId,status:'accepted_for_coordination',body:'We can continue coordination.'}}).success).toBe(false));
  it('allows a confirmed further-review response without implying acceptance',()=>expect(inquiryCommandSchema.safeParse({action:'provider_response',input:{operationId:randomUUID(),caseId,status:'further_review',body:'Our team needs further coordination.',confirmed:true}}).success).toBe(true));
  it('describes further review and inability in patient next steps',()=>{
    const base={case:{status:'in_progress',share_with_provider:true,provider_response_status:'further_review'},organization:{id:otherId,name:'Authorized team'},documentRequests:[]} as unknown as InquiryContext;
    expect(inquiryNextStep(base)).toContain('requires further coordination');
    expect(inquiryNextStep({...base,case:{...base.case,provider_response_status:'unable_to_coordinate'}})).toContain('cannot proceed');
    expect(providerStatusLabel('accepted_for_coordination')).toBe('Provider confirmed it can continue coordination');
  });
  it('explains private versus provider-visible information replies',()=>{
    const base={case:{status:'waiting_patient',share_with_provider:true,provider_response_status:'information_requested'},organization:{id:otherId,name:'Authorized team'},documentRequests:[]} as unknown as InquiryContext;
    expect(inquiryNextStep(base)).toContain('authorized provider when replying');
    expect(inquiryNextStep({...base,case:{...base.case,status:'in_progress',share_with_provider:false},providerCoordination:{available:false,latestResponse:null,informationAnsweredAt:null,informationRequestedAt:null}})).toContain('no provider response is confirmed');
  });
  it('accepts reviewed, consented published entity context',()=>expect(inquiryCommandSchema.parse(create)).toEqual(create));
  it.each(['consent','reviewed'])('rejects missing %s',field=>{const input:Record<string,unknown>={...create.input};delete input[field as keyof typeof input];expect(inquiryCommandSchema.safeParse({...create,input}).success).toBe(false);});
  it('rejects caller-supplied patient, actor and org ownership',()=>expect(inquiryCommandSchema.safeParse({...create,input:{...create.input,patientId:otherId,organizationId:otherId}}).success).toBe(false));
  it('rejects a fabricated source or legacy bypass',()=>expect(inquiryCommandSchema.safeParse({...create,input:{...create.input,source:'legacy'}}).success).toBe(false));
  it('requires the reviewed publication revision',()=>{const input:Record<string,unknown>={...create.input};delete input.expectedPublishedRevision;expect(inquiryCommandSchema.safeParse({...create,input}).success).toBe(false);});
  it('requires separate document consent and purpose',()=>expect(inquiryCommandSchema.safeParse({action:'share_document',input:{operationId:randomUUID(),caseId,documentId:randomUUID(),recipient:'provider',purpose:'Coordination'}}).success).toBe(false));
  it('rejects missing retry key',()=>expect(inquiryCommandSchema.safeParse({action:'message',input:{caseId,body:'Hello',visibility:'patient'}}).success).toBe(false));
  it('rejects whitespace-only messages',()=>expect(inquiryCommandSchema.safeParse({action:'message',input:{operationId:randomUUID(),caseId,body:'   ',visibility:'patient'}}).success).toBe(false));
  it('rejects unsupported cancellation as a provider response',()=>expect(inquiryCommandSchema.safeParse({action:'provider_response',input:{operationId:randomUUID(),caseId,status:'cancelled',body:'Coordination'}}).success).toBe(false));
  it('rejects Recover task without explicit confirmation',()=>expect(inquiryCommandSchema.safeParse({action:'link_recovery',input:{operationId:randomUUID(),caseId,journeyId:randomUUID(),eventId:randomUUID(),title:'Review update'}}).success).toBe(false));
  it('checks actual file signature, extension and MIME',()=>{expect(()=>validateUpload('summary.pdf','application/pdf',new TextEncoder().encode('not a PDF'))).toThrow();expect(()=>validateUpload('summary.png','image/png',new TextEncoder().encode('%PDF-test'))).toThrow();});
  it('rejects empty and oversized files',()=>{expect(()=>validateUpload('a.pdf','application/pdf',new Uint8Array())).toThrow();expect(()=>validateUpload('a.pdf','application/pdf',new Uint8Array(3145729))).toThrow();});
});
describe('owner-scoped registered inquiry tool and conversation references',()=>{
  const published={...hospital,name:'Sourced Hospital',demo:false,sourceKind:'external' as const};
  const publishedTools={...tools,repository:{...tools.repository,loadSnapshot:async()=>({...snapshot,hospitals:[published]}),listHospitals:async()=>[published]}};
  it('reads a named listing before handing off to the existing consent form',async()=>{
    const h=harness(unavailable,publishedTools),response=await h.send('Make an inquiry about Sourced Hospital');
    expect(h.actions).toEqual(['get_hospital_details']);expect(response.inquiryPreparation?.state).toBe('review_required');
    expect(response.inquiryPreparation?.href).toContain(`entityId=${published.recordId}`);expect(response.inquiryPreparation?.href).toContain(`conversation=${response.conversationId}`);
    expect(response.summary).toContain('No inquiry has been submitted');expect(response.activity?.state).toBe('waiting_for_input');expect(response.inquiries).toBeUndefined();
  });
  it('uses the previously displayed ordinal for inquiry preparation',async()=>{
    const h=harness(unavailable,publishedTools),first=await h.send('Find knee replacement hospitals in Mumbai.');
    const response=await h.send('Make an inquiry for the first hospital',first.conversationId);
    expect(response.inquiryPreparation?.name).toBe(published.name);expect(response.inquiryPreparation?.href).toContain(published.recordId);
  });
  it('clarifies an inquiry without an unambiguous listing',async()=>{
    const h=harness(),response=await h.send('Make an inquiry');expect(response.question).toContain('Which published');expect(response.inquiryPreparation).toBeUndefined();expect(h.actions).toEqual([]);
  });
  it('does not offer submission for a synthetic listing',async()=>{
    const h=harness(),response=await h.send(`Make an inquiry about ${hospital.name}`);expect(response.inquiryPreparation).toBeUndefined();expect(response.summary).toContain('Synthetic listings cannot');
  });
  it('retains a clinical gate before preparing an inquiry',async()=>{
    const h=harness(unavailable,publishedTools),response=await h.send('Diagnose chest pain and make an inquiry about Sourced Hospital');expect(response.inquiryPreparation).toBeUndefined();expect(response.summary).toContain('cannot diagnose');
  });
  it('uses the existing planning agent and read-only permission',()=>expect(toolRegistry.get_inquiry_context).toMatchObject({sideEffect:'read',mode:'read',authorization:'authenticated',allowedAgents:['treatment_planning']}));
  it('does not infer an inquiry from an unrelated conversation',()=>expect(inquiryIntent('What is its status?')).toBeNull());
  it('resolves a follow-up only from the supplied conversation reference',()=>expect(inquiryIntent('What is its status?',context)).toEqual({caseId,ambiguous:false}));
  it('asks for clarification on multiple explicit IDs',()=>expect(inquiryIntent(`Show inquiry ${caseId} and ${otherId}`)).toEqual({ambiguous:true}));
  it('excludes raw case data, notes and document paths from AI output schema',()=>expect(inquiryAgentSchema.safeParse({...context,internalNotes:'private',storagePath:'private'}).success).toBe(false));
  it('denies visitor access even if a read dependency exists',async()=>{await expect(executeTool('get_inquiry_context',{},{agent:'treatment_planning',userId,caseAccess:{readContext:async()=>({}),readDocumentMetadata:async()=>[]}},{...tools,publicSession:true,inquiryRead:async()=>context})).rejects.toMatchObject({code:'AUTH_REQUIRED'});});
  it('denies missing authenticated inquiry integration',async()=>{await expect(executeTool('get_inquiry_context',{},{agent:'treatment_planning',userId,caseAccess:{readContext:async()=>({}),readDocumentMetadata:async()=>[]}},tools)).rejects.toMatchObject({code:'AUTH_REQUIRED'});});
  it('passes authenticated owner and exact selected case to authorization',async()=>{const read=vi.fn(async()=>context);const result=await executeTool('get_inquiry_context',{caseId},{agent:'treatment_planning',userId,caseAccess:{readContext:async()=>({}),readDocumentMetadata:async()=>[]}},{...tools,inquiryRead:read});expect(read).toHaveBeenCalledWith(userId,caseId);expect(result.inquiries?.selectedId).toBe(caseId);});
  it('uses persisted same-conversation inquiry reference on the next turn',async()=>{const read=vi.fn(async()=>context),h=harness(unavailable,{...tools,inquiryRead:read});const first=await h.send(`Show my inquiry ${caseId}`);expect(first.inquiries?.selectedId).toBe(caseId);const follow=await h.send('What is its status?',first.conversationId);expect(follow.inquiries?.selectedId).toBe(caseId);expect(read).toHaveBeenLastCalledWith(userId,caseId);expect(h.actions).toEqual(['get_inquiry_context','get_inquiry_context']);});
  it('does not carry an inquiry reference into a different conversation',async()=>{const read=vi.fn(async()=>context),h=harness(unavailable,{...tools,inquiryRead:read});await h.send(`Show my inquiry ${caseId}`);read.mockClear();const unrelated=await h.send('What is its status?');expect(unrelated.inquiries).toBeUndefined();expect(read).not.toHaveBeenCalled();});
  it('keeps cancellation as a reviewed UI action, never a model write',async()=>{const h=harness(unavailable,{...tools,inquiryRead:async()=>context});const response=await h.send(`Cancel my inquiry ${caseId}`);expect(response.inquiries?.selectedId).toBe(caseId);expect(response.summary).toContain('No message, consent, upload, status change or cancellation has been performed');expect(h.actions).toEqual(['get_inquiry_context']);});
});
