import 'server-only';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database,Json} from '@/types/database';
import {AgentError} from '@/lib/agents/errors';
import {validateUpload} from './coordination';
const verdict=z.object({checksum:z.string().regex(/^[a-f0-9]{64}$/),size:z.number().int().positive().max(3145728),mime:z.enum(['application/pdf','image/jpeg','image/png'])});
// RPCs are added by the security migration. Keep their ungenerated boundary local.
export async function securityRpc(db:SupabaseClient<Database>,name:string,args:Record<string,unknown>={}) {
 const r=await (db.rpc as unknown as (name:string,args:Record<string,Json>)=>Promise<{data:Json;error:unknown}>)(name,args as Record<string,Json>);
 if(r.error)throw new AgentError('DOCUMENT_SECURITY_BLOCKED','This file is blocked until its security checks succeed.');
 return r.data;
}
export async function registerScan(db:SupabaseClient<Database>,bucket:string,path:string,bytes:Uint8Array,mime:string,filename:string) {
 const checksum=validateUpload(filename,mime,bytes);
 return z.object({id:z.uuid(),state:z.enum(['pending_scan','scanning','clean','quarantined','scan_failed'])}).parse(await securityRpc(db,'document_security_register',{p_bucket:bucket,p_path:path,p_checksum:checksum,p_size:bytes.length,p_mime:mime}));
}
export async function assertClean(db:SupabaseClient<Database>,bucket:string,path:string) {
 return verdict.parse(await securityRpc(db,'document_security_assert_clean',{p_bucket:bucket,p_path:path}));
}
export async function scannedDownload(db:SupabaseClient<Database>,bucket:string,path:string) {
 const proof=await assertClean(db,bucket,path),r=await db.storage.from(bucket).download(path);
 if(r.error||!r.data)throw new AgentError('DOCUMENT_SECURITY_BLOCKED','This file is unavailable.');
 const bytes=await r.data.arrayBuffer();
 if(bytes.byteLength!==proof.size||createHash('sha256').update(Buffer.from(bytes)).digest('hex')!==proof.checksum)
  throw new AgentError('DOCUMENT_SECURITY_BLOCKED','This file failed its integrity check.');
 await assertClean(db,bucket,path); // a requeue/retirement during buffering must block delivery
 return bytes;
}
