import {describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
vi.mock('server-only',()=>({}));
import {completeDeletion,requestDeletion} from '@/lib/documents/deletion';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from '@/types/database';
const id=randomUUID(),lease=randomUUID();
function fixture(infoError:unknown={status:404},removeError:unknown=null) {
 const remove=vi.fn(async()=>({error:removeError})),info=vi.fn(async()=>({data:null,error:infoError}));
 const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>({data:name==='document_deletion_claim'?{id,lease,bucket:'care-documents',path:'opaque'}:name==='document_deletion_request'?{id,state:'queued'}:{id,state:args.p_absent?'deleted':'cleanup_failed'},error:null}));
 return {db:{rpc,storage:{from:()=>({remove,info})}} as unknown as SupabaseClient<Database>,remove,info,rpc};
}
describe('truthful storage cleanup',()=>{
 it('returns persisted completion on a duplicate recovery command without another Storage action',async()=>{const f=fixture();f.rpc.mockResolvedValueOnce({data:{id,state:'deleted'},error:null} as never);expect((await completeDeletion(f.db,id)).state).toBe('deleted');expect(f.remove).not.toHaveBeenCalled();});
 it.each([{status:404},{statusCode:'404'},{code:'NoSuchKey'}])('requires an explicit absence proof %s',async(error)=>{const f=fixture(error);expect((await completeDeletion(f.db,id)).state).toBe('deleted');expect(f.rpc).toHaveBeenLastCalledWith('document_deletion_result',{p_id:id,p_lease:lease,p_absent:true,p_category:null});});
 it.each([null,{status:403},{status:500},{message:'not found SECRET'}])('does not treat %s as absence',async(error)=>{const f=fixture(error);await expect(completeDeletion(f.db,id)).rejects.toMatchObject({code:'DOCUMENT_CLEANUP_PENDING'});expect(f.rpc.mock.calls.at(-1)?.[1].p_absent).toBe(false);});
 it('persists a failed remove without accessing object info',async()=>{const f=fixture(null,{message:'PRIVATE URL'});await expect(completeDeletion(f.db,id)).rejects.toMatchObject({code:'DOCUMENT_CLEANUP_PENDING',publicMessage:expect.stringContaining('unconfirmed')});expect(f.info).not.toHaveBeenCalled();});
 it('persists transport interruption without leaking raw errors',async()=>{const f=fixture();f.remove.mockRejectedValueOnce(new Error('SECRET path'));await expect(completeDeletion(f.db,id)).rejects.toMatchObject({code:'DOCUMENT_CLEANUP_PENDING',publicMessage:expect.stringContaining('unconfirmed')});expect(f.rpc.mock.calls.at(-1)?.[1]).toMatchObject({p_absent:false,p_category:'storage_unavailable'});});
 it('does not claim completion when the database ACK fails',async()=>{const f=fixture();f.rpc.mockResolvedValueOnce({data:{id,lease,bucket:'care-documents',path:'opaque'},error:null}).mockResolvedValueOnce({data:null,error:{message:'SECRET'}} as never);await expect(completeDeletion(f.db,id)).rejects.toMatchObject({code:'DOCUMENT_CLEANUP_PENDING',publicMessage:expect.stringContaining('unconfirmed')});});
 it('does not issue storage actions when claim is held, exhausted or leased',async()=>{const f=fixture();f.rpc.mockResolvedValueOnce({data:null,error:null} as never);await expect(completeDeletion(f.db,id)).rejects.toMatchObject({code:'DOCUMENT_CLEANUP_PENDING',publicMessage:expect.stringContaining('operator review')});expect(f.remove).not.toHaveBeenCalled();});
 it('uses server-owned workspace and actor scope in the request',async()=>{const f=fixture(),workspace=randomUUID(),document=randomUUID(),owner=randomUUID();await requestDeletion(f.db,workspace,document,owner);expect(f.rpc).toHaveBeenCalledWith('document_deletion_request',{p_workspace:workspace,p_document:document,p_actor:owner});});
});
