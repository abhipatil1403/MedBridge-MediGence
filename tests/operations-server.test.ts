import {it,expect,vi,afterEach} from 'vitest';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/agents/persistence',()=>({createAdminClient:()=>({rpc})}));
vi.mock('@/lib/agents/cloudflare-provider',()=>({cloudflareConfigured:()=>false}));
import {recordRequest} from '@/lib/operations/server';
import type {RequestEvent} from '@/lib/operations/contracts';
const event:RequestEvent={correlationId:'11111111-1111-4111-8111-111111111111',kind:'ai',action:'execute',outcome:'failed',category:'timeout',durationMs:100,retryCount:0,modelFailures:['timeout'],recovered:false};
afterEach(()=>vi.restoreAllMocks());
it('keeps an already completed product outcome intact when telemetry storage fails, without raw diagnostics',async()=>{
 rpc.mockReturnValue({abortSignal:async()=>({error:{message:'password token private patient prompt',code:'08006'}})});
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 await expect(recordRequest('11111111-1111-4111-8111-111111111111',event)).resolves.toBeUndefined();
 expect(log).toHaveBeenCalledWith('{"event":"operations_telemetry_unavailable"}');
 expect(JSON.stringify(log.mock.calls)).not.toMatch(/password|token|patient|prompt/);
});
it('rejects unexpected payload fields before calling the service RPC',async()=>{
 rpc.mockClear();vi.spyOn(console,'error').mockImplementation(()=>{});
 await recordRequest('11111111-1111-4111-8111-111111111111',{...event,prompt:'sensitive'} as RequestEvent);
 expect(rpc).not.toHaveBeenCalled();
});
