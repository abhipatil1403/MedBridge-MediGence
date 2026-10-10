import 'server-only';
import {z} from 'zod';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database,Json} from '@/types/database';
import {AgentError} from '@/lib/agents/errors';

const resultSchema=z.object({id:z.uuid(),state:z.enum(['queued','deleting','cleanup_failed','held','deleted'])});
export async function deletionRpc(db:SupabaseClient<Database>,name:string,args:Record<string,unknown>={}) {
 const result=await (db.rpc as unknown as (name:string,args:Record<string,Json>)=>Promise<{data:Json;error:unknown}>)(name,args as Record<string,Json>);
 if(result.error)throw new AgentError('DOCUMENT_CLEANUP_PENDING','Storage cleanup is unconfirmed. Access remains blocked; retry removal or ask Support to review the cleanup job.');
 return result.data;
}
export async function requestDeletion(db:SupabaseClient<Database>,workspace:string,document:string,owner:string) {
 return resultSchema.parse(await deletionRpc(db,'document_deletion_request',{p_workspace:workspace,p_document:document,p_actor:owner}));
}
// A successful remove response alone does not establish that the object is gone.
// Only a genuine object-info 404/NoSuchKey plus the database check can complete it.
export async function completeDeletion(db:SupabaseClient<Database>,id:string) {
 const raw=await deletionRpc(db,'document_deletion_claim',{p_id:id});
 if(!raw)throw new AgentError('DOCUMENT_CLEANUP_PENDING','Storage cleanup is held, already running, waiting to retry, or needs operator review. Access remains blocked.');
 if(typeof raw==='object'&&!Array.isArray(raw)&&raw.state==='deleted')return resultSchema.parse(raw);
 const job=z.object({id:z.uuid(),lease:z.uuid(),bucket:z.literal('care-documents'),path:z.string().min(1)}).parse(raw);
 let absent=false,category='storage_unavailable';
 try {
  const storage=db.storage.from(job.bucket),removed=await storage.remove([job.path]);
  if(!removed.error) {
   const info=await storage.info(job.path);
   const error=info.error as {status?:number;statusCode?:string;code?:string}|null;
   absent=Boolean(error&&(error.status===404||error.statusCode==='404'||error.code==='NoSuchKey'));
   if(!info.error)category='object_remains';
  }
 } catch { /* Persist a bounded retry without logging filenames, paths or provider errors. */ }
 const result=resultSchema.parse(await deletionRpc(db,'document_deletion_result',{p_id:job.id,p_lease:job.lease,p_absent:absent,p_category:absent?null:category}));
 if(result.state!=='deleted')throw new AgentError('DOCUMENT_CLEANUP_PENDING','Access is blocked, but stored-file deletion is unconfirmed. Retry after the retry delay or ask Support to review the cleanup job.');
 return result;
}
