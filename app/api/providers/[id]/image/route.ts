import { z } from 'zod';
import { createAdminClient } from '@/lib/agents/persistence';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;if(!z.uuid().safeParse(id).success)return new Response(null,{status:404});
  const db=createAdminClient();const result=await db.rpc('public_provider_image',{p_doctor_id:id});
  const parsed=z.object({path:z.string(),mime:z.enum(['image/jpeg','image/png'])}).safeParse(result.data);
  if(result.error||!parsed.success)return new Response(null,{status:404});
  const file=await db.storage.from('provider-documents').download(parsed.data.path);
  if(file.error||!file.data)return new Response(null,{status:404});
  return new Response(await file.data.arrayBuffer(),{headers:{'Content-Type':parsed.data.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
