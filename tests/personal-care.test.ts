import { describe,it,expect,vi } from 'vitest';
vi.mock('server-only',()=>({}));
import { currencies,locales,preferenceSchema,profileSchema,browserLocale,recoveryCommandSchema } from '@/lib/experience/preferences';
import { convertPrice,parseRateProvider,rateSnapshotSchema } from '@/lib/experience/currency';
import { translate } from '@/lib/experience/messages';
import { freshVisitor,visitorStores,visitorSchema } from '@/lib/experience/visitor-store';
import { executeTool } from '@/lib/agents/tools';
import { requestBoundary } from '@/lib/agents/runtime';
import { harness,tools,unavailable } from './fixtures/comparison-harness';
import { coordinationSchema } from '@/lib/experience/coordination-schema';
import { randomUUID } from 'node:crypto';

const now=Date.parse('2026-10-05T12:00:00Z');
// Isolated conversion test data only. Never shipped, cached or seeded as provider rates.
const rateFixture=rateSnapshotSchema.parse({base:'USD',rates:{USD:1,INR:80,AED:4,EUR:.8},source:'https://www.exchangerate-api.com',updatedAt:'2026-10-05T00:00:00Z',fetchedAt:'2026-10-05T11:00:00Z',expiresAt:'2026-10-06T00:00:00Z'});
describe('currency presentation boundaries',()=>{
  it('offers exactly the eight supported currencies',()=>expect(currencies).toEqual(['USD','AED','AUD','CAD','EUR','GBP','INR','MYR']));
  it('rejects unsupported currency preferences',()=>expect(preferenceSchema.safeParse({locale:'en',currency:'XXX'}).success).toBe(false));
  it('accepts real persisted presentation preferences',()=>expect(preferenceSchema.parse({locale:'mr',currency:'MYR'})).toEqual({locale:'mr',currency:'MYR'}));
  it('does not mutate an original amount or currency',()=>{const input=Object.freeze({amount:4700,currency:'USD'});const result=convertPrice(input.amount,input.currency,'INR',rateFixture,now);expect(input).toEqual({amount:4700,currency:'USD'});expect(result?.originalAmount).toBe(4700);expect(result?.originalCurrency).toBe('USD');});
  it('calculates using the provided cached rate',()=>expect(convertPrice(4700,'USD','INR',rateFixture,now)?.amount).toBe(376000));
  it('calculates cross-currency conversion through the source base',()=>expect(convertPrice(100,'EUR','AED',rateFixture,now)?.amount).toBe(500));
  it('preserves exact rate source and update timestamp',()=>expect(convertPrice(1,'USD','INR',rateFixture,now)).toMatchObject({rate:80,updatedAt:rateFixture.updatedAt,source:rateFixture.source,stale:false}));
  it('labels stale snapshots explicitly',()=>expect(convertPrice(1,'USD','INR',rateFixture,Date.parse('2026-10-07T00:00:00Z'))?.stale).toBe(true));
  it('falls back to original when rates are unavailable',()=>expect(convertPrice(4700,'USD','INR',null,now)).toBeNull());
  it('falls back when source currency has no known rate',()=>expect(convertPrice(4700,'XYZ','INR',rateFixture,now)).toBeNull());
  it('does not apply conversion to an unchanged currency',()=>expect(convertPrice(4700,'USD','USD',rateFixture,now)).toBeNull());
  it.each([NaN,Infinity,-1])('rejects invalid amounts %s',amount=>expect(convertPrice(amount,'USD','INR',rateFixture,now)).toBeNull());
  it('validates real provider response dates and source',()=>expect(Date.parse(parseRateProvider({result:'success',provider:rateFixture.source,base_code:'USD',rates:rateFixture.rates,time_last_update_unix:Date.parse(rateFixture.updatedAt)/1000,time_next_update_unix:Date.parse(rateFixture.expiresAt)/1000},now).updatedAt)).toBe(Date.parse(rateFixture.updatedAt)));
  it('rejects a fake or mismatched provider',()=>expect(()=>parseRateProvider({result:'success',provider:'https://fake.invalid'},now)).toThrow());
  it('rejects invalid base rates',()=>expect(()=>parseRateProvider({result:'success',provider:rateFixture.source,base_code:'USD',rates:{USD:2},time_last_update_unix:now/1000,time_next_update_unix:now/1000+86400},now)).toThrow());
});
describe('supported locales and general profiles',()=>{
  it('only offers English Hindi and Marathi',()=>expect(locales).toEqual(['en','hi','mr']));
  it.each([['hi-IN','hi'],['mr-IN','mr'],['en-GB','en'],['de-DE','en']])('resolves browser language %s', (input,expected)=>expect(browserLocale(input)).toBe(expected));
  it('uses real Hindi navigation',()=>expect(translate('Hospitals','hi')).toBe('अस्पताल'));
  it('uses real Marathi navigation',()=>expect(translate('Hospitals','mr')).toBe('रुग्णालये'));
  it('preserves canonical names not in interface dictionary',()=>expect(translate('Deenanath Mangeshkar Hospital','mr')).toBe('Deenanath Mangeshkar Hospital'));
  it('preserves URLs and source citations',()=>expect(translate('https://www.example.com/source','hi')).toBe('https://www.example.com/source'));
  it('general profile rejects unnecessary medical fields',()=>expect(profileSchema.safeParse({locale:'en',currency:'USD',display_name:'QA',phone:'',country:'',city:'',inApp:true,diagnosis:'x'}).success).toBe(false));
  it('accepts optional contact fields and real communication preference',()=>expect(profileSchema.parse({locale:'hi',currency:'INR',display_name:'QA',phone:'',country:'India',city:'Pune',inApp:false}).inApp).toBe(false));
});
describe('temporary assistant uses the existing store contracts',()=>{
  it('creates an opaque fresh visitor conversation',()=>{const state=freshVisitor();expect(state.userId).not.toBe(state.conversationId);expect(state.messages).toEqual([]);expect(visitorSchema.parse(state)).toEqual(state);});
  it('retains ordinary conversation messages across serialization',async()=>{const state=freshVisitor(),{store}=visitorStores(state);await store.addMessage(state.conversationId,'user','Find hospitals');const reloaded=visitorSchema.parse(JSON.parse(JSON.stringify(state)));expect(reloaded.messages[0].content).toBe('Find hospitals');});
  it('rejects another conversation',async()=>{const state=freshVisitor();await expect(visitorStores(state).store.assertConversation(randomUUID(),state.userId)).rejects.toThrow();});
  it('rejects a different owner',async()=>{const state=freshVisitor();await expect(visitorStores(state).store.assertConversation(state.conversationId,randomUUID())).rejects.toThrow();});
  it('rejects linking a private case to a visitor',async()=>{const state=freshVisitor();await expect(visitorStores(state).store.assertConversation(state.conversationId,state.userId,randomUUID())).rejects.toThrow();});
  it('serializes turns with the existing planning-store lease',async()=>{const state=freshVisitor(),{planningStore}=visitorStores(state);const lease=randomUUID();expect(await planningStore.acquire(state.conversationId,state.userId,lease)).toBe(true);expect(await planningStore.acquire(state.conversationId,state.userId,randomUUID())).toBe(false);await planningStore.release(state.conversationId,lease);expect(await planningStore.acquire(state.conversationId,state.userId,randomUUID())).toBe(true);});
  it.each(['get_case_context','get_case_documents_metadata','create_case','request_external_action','get_recovery_context','get_provider_verification_history'] as const)('visitor cannot invoke private/proposed tool %s',async tool=>{await expect(executeTool(tool,tool==='get_case_context'||tool==='get_case_documents_metadata'?{caseId:randomUUID()}:tool==='create_case'?{title:'QA case'}:tool==='request_external_action'?{action:'booking'}:tool==='get_provider_verification_history'?{providerType:'hospital',providerId:randomUUID()}: {},{agent:tool==='get_provider_verification_history'?'provider_verification':'treatment_planning',userId:randomUUID(),caseAccess:{readContext:async()=>{throw new Error('Private read must not run');},readDocumentMetadata:async()=>{throw new Error('Private read must not run');}}},{...tools,publicSession:true})).rejects.toThrow();});
  it('keeps registered public catalog tools available',async()=>{const result=await executeTool('search_hospitals',{query:'knee replacement in Mumbai'},{agent:'discovery',userId:randomUUID(),caseAccess:{readContext:async()=>({}),readDocumentMetadata:async()=>[]}},{...tools,publicSession:true});expect(result.findings.length).toBeGreaterThan(0);});
  it('retains only bounded temporary transcript state',async()=>{const state=freshVisitor(),{store}=visitorStores(state);for(let i=0;i<45;i++)await store.addMessage(state.conversationId,'user',`Request ${i}`);expect(state.messages).toHaveLength(40);});
});
describe('recovery coordination and clinical boundaries',()=>{
  it.each(['Is my recovery medically normal?','Is my wound infected?','What medication should I take?'])('guards clinical question %s',input=>expect(requestBoundary(input)).toBe('clinical'));
  it('does not classify task retrieval as diagnosis',()=>expect(requestBoundary('Show my upcoming recovery tasks.')).toBeUndefined());
  it('requires support sharing consent',()=>expect(recoveryCommandSchema.safeParse({action:'create_support',journeyId:randomUUID(),title:'QA help',description:'Help contact my provider',consent:false}).success).toBe(false));
  it('rejects claimed provider-supplied or clinical task data',()=>expect(recoveryCommandSchema.safeParse({action:'add_task',journeyId:randomUUID(),title:'Contact provider',source:'provider',diagnosis:'x'}).success).toBe(false));
  it('retrieves actual owner-scoped context through the existing registry',async()=>{
    const context=coordinationSchema.parse({scope:'owner_non_clinical_coordination',journeys:[],tasks:[],events:[],savedProviders:[],documents:[],boundary:'Non-clinical only'});
    const read=vi.fn(async()=>context),h=harness(unavailable,{...tools,recoveryRead:read});const response=await h.send('Show my upcoming recovery tasks.');
    expect(read).toHaveBeenCalledOnce();expect(h.actions).toContain('get_recovery_context');expect(response.coordination).toEqual(context);expect(response.status).toBe('completed');
  });
});
