import {NextRequest,NextResponse} from 'next/server';
import {timingSafeEqual,createHash} from 'node:crypto';
import {z} from 'zod';
import {createAdminClient} from '@/lib/agents/persistence';
import {securityRpc} from '@/lib/documents/security';
import {scanJob,scanResult} from '@/lib/documents/scanner-protocol';
import {validateUpload} from '@/lib/documents/coordination';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
function authorized(request:NextRequest){
 const configured=process.env.MEDBRIDGE_DOCUMENT_SCANNER_TOKEN,received=request.headers.get('authorization')?.replace(/^Bearer /,'');
 if(process.env.MEDBRIDGE_DOCUMENT_SCANNER_ENABLED!=='true'||!configured||configured.length<32||!received)return false;
 const expected=Buffer.from(configured),actual=Buffer.from(received);
 return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
async function leased(id:string,lease:string,allowCompleted=false){
 const db=createAdminClient();
 const r=await (db.from as unknown as (table:string)=>ReturnType<typeof db.from>)('document_security_jobs').select('*').eq('id',id).maybeSingle();
 const j=scanJob.parse(r.data);
 const live=j.state==='scanning'&&j.lease_until!==null&&Date.parse(j.lease_until)>Date.now();
 const completed=allowCompleted&&['clean','quarantined'].includes(j.state);
 if(r.error||j.lease!==lease||(!live&&!completed))throw new Error('lease');
 return {db,j};
}
async function bytesFor(db:ReturnType<typeof createAdminClient>,j:z.infer<typeof scanJob>){
 const r=await db.storage.from(j.bucket).download(j.object_path);if(r.error||!r.data||r.data.size!==j.size_bytes)throw new Error('integrity');
 const bytes=new Uint8Array(await r.data.arrayBuffer());
 const extension=j.mime_type==='application/pdf'?'pdf':j.mime_type==='image/png'?'png':'jpg';
 if(validateUpload(`scan.${extension}`,j.mime_type,bytes)!==j.checksum)throw new Error('integrity');
 return bytes;
}
export async function POST(request:NextRequest){
 if(!authorized(request))return NextResponse.json({error:'Scanner access unavailable.'},{status:401,headers});
 try{
  if(Number(request.headers.get('content-length')??0)>3000)throw new Error('size');
  const payload=await request.text();if(Buffer.byteLength(payload)>3000)throw new Error('size');
  const body=z.discriminatedUnion('action',[
   z.object({action:z.literal('claim')}).strict(),
   z.object({action:z.literal('result'),id:z.uuid(),lease:z.uuid(),result:scanResult}).strict(),
  ]).parse(JSON.parse(payload));
  const db=createAdminClient();
  if(body.action==='claim'){
   const raw=await securityRpc(db,'document_security_claim');if(!raw)return NextResponse.json({job:null},{headers});
   const j=scanJob.parse(raw);return NextResponse.json({job:{id:j.id,lease:j.lease,checksum:j.checksum,size:j.size_bytes,mime:j.mime_type}},{headers});
  }
  // Verify the report's checksum against the exact stored bytes server-side.
  // Failed reports carry no clean verdict and do not need content retrieval.
  if(body.result.state!=='scan_failed'){
   // SQL accepts a completed retry only for the same lease and exact result hash.
   const {j}=await leased(body.id,body.lease,true);const bytes=await bytesFor(db,j);
   if(createHash('sha256').update(bytes).digest('hex')!==body.result.checksum)throw new Error('integrity');
  }
  return NextResponse.json(await securityRpc(db,'document_security_result',{p_id:body.id,p_lease:body.lease,p_result:body.result}),{headers});
 }catch{return NextResponse.json({error:'No new scan verdict was accepted. Check the persisted job status before retrying.'},{status:409,headers});}
}
export async function GET(request:NextRequest){
 if(!authorized(request))return NextResponse.json({error:'Scanner access unavailable.'},{status:401,headers});
 try{
  const q=z.object({id:z.uuid(),lease:z.uuid()}).strict().parse(Object.fromEntries(request.nextUrl.searchParams));
  const {db,j}=await leased(q.id,q.lease),bytes=await bytesFor(db,j);
  return new NextResponse(Buffer.from(bytes),{headers:{...headers,'Content-Type':'application/octet-stream','Content-Length':String(bytes.length),'Content-Disposition':'attachment'}});
 }catch{return NextResponse.json({error:'This scan payload is unavailable.'},{status:403,headers});}
}
