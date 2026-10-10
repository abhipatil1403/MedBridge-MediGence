import {it,expect,vi} from 'vitest';
import {createServer} from 'node:http';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {NextRequest} from 'next/server';
vi.mock('server-only',()=>({}));
const holder=vi.hoisted(()=>({admin:undefined as unknown}));
vi.mock('@/lib/agents/persistence',()=>({createAdminClient:()=>holder.admin}));
import {localSqlClient} from './fixtures/local-sql-client';
import {antivirusTestPdf} from './fixtures/scanner-pdf';
import {GET,POST} from '@/app/api/internal/document-scans/route';
import {registerScan,securityRpc,scannedDownload} from '@/lib/documents/security';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from '@/types/database';
it.skipIf(!process.env.MEDBRIDGE_REAL_CLAMAV_TEST||!process.env.MEDBRIDGE_LOCAL_WORKFLOW_DB)('real local PostgreSQL + HTTP worker + ClamAV: clean delivery, quarantine and no signing bypass',async()=>{
 const root=localSqlClient(process.env.MEDBRIDGE_LOCAL_WORKFLOW_DB!,'postgres'),client=localSqlClient(process.env.MEDBRIDGE_LOCAL_WORKFLOW_DB!,'service_role').db;
 const objects=new Map<string,Uint8Array>(),token=randomBytes(32).toString('hex');
 const admin={...client,storage:{from:()=>({download:async(path:string)=>({data:objects.has(path)?new Blob([Buffer.from(objects.get(path)!)]):null,error:objects.has(path)?null:{code:'missing'}})})}} as unknown as SupabaseClient<Database>;
 holder.admin=admin;const before={enabled:process.env.MEDBRIDGE_DOCUMENT_SCANNER_ENABLED,token:process.env.MEDBRIDGE_DOCUMENT_SCANNER_TOKEN};
 process.env.MEDBRIDGE_DOCUMENT_SCANNER_ENABLED='true';process.env.MEDBRIDGE_DOCUMENT_SCANNER_TOKEN=token;
 const server=createServer(async(req,res)=>{try{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const request=new NextRequest(`http://127.0.0.1${req.url}`,{method:req.method,headers:{authorization:req.headers.authorization??'','content-type':'application/json'},...(req.method==='POST'?{body:Buffer.concat(chunks).toString()}:{} )});const response=await(req.method==='POST'?POST(request):GET(request));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500).end();}});
 try{
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('local server');
  for(const [payload,state] of [[Buffer.from('%PDF-1.7\nQA harmless fixture\n%%EOF'),'clean'],[antivirusTestPdf(),'quarantined']] as const){
   const path=`QA-pipeline/${randomUUID()}.pdf`,job=await registerScan(admin,'care-documents',path,payload,'application/pdf','fixture.pdf');objects.set(path,payload);
   root.sql(`insert into storage.objects(bucket_id,name) values('care-documents','${path}');select to_json(true)`);
   await securityRpc(admin,'document_security_ready',{p_id:job.id});
   await expect(scannedDownload(admin,'care-documents',path)).rejects.toThrow();
   const worker=await promisify(execFile)(process.execPath,['scripts/document-scanner/worker.mjs','--once'],{env:{...process.env,MEDBRIDGE_SCANNER_ORIGIN:`http://127.0.0.1:${address.port}`,MEDBRIDGE_DOCUMENT_SCANNER_TOKEN:token},timeout:100000});
   expect(worker.stdout).not.toMatch(/fixture|QA-pipeline|checksum|token/);
   expect(root.sql(`select to_json(state) from public.document_security_jobs where id='${job.id}'`)).toBe(state);
   const saved=root.sql(`select row_to_json(j) from public.document_security_jobs j where id='${job.id}'`) as {lease:string;checksum:string;engine_version:string;signature_version:string;signature_at:string};
   const result={state,checksum:saved.checksum,engine:'ClamAV',engineVersion:saved.engine_version,signatureVersion:saved.signature_version,signatureAt:new Date(saved.signature_at).toISOString(),policyVersion:'clamav-v1'};
   const request=()=>new NextRequest('http://127.0.0.1/api/internal/document-scans',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({action:'result',id:job.id,lease:saved.lease,result})});
   const auditBefore=root.sql(`select to_json(count(*)) from public.audit_events where entity_id='${job.id}'`);
   expect((await POST(request())).status).toBe(200);
   expect(root.sql(`select to_json(count(*)) from public.audit_events where entity_id='${job.id}'`)).toBe(auditBefore);
   const endedPayload=await GET(new NextRequest(`http://127.0.0.1/api/internal/document-scans?id=${job.id}&lease=${saved.lease}`,{headers:{Authorization:`Bearer ${token}`}}));expect(endedPayload.status).toBe(403);
   if(state==='clean')expect(Buffer.from(await scannedDownload(admin,'care-documents',path))).toEqual(payload);else await expect(scannedDownload(admin,'care-documents',path)).rejects.toThrow();
   expect(localSqlClient(process.env.MEDBRIDGE_LOCAL_WORKFLOW_DB!,'authenticated').sql(`select to_json(count(*)) from storage.objects where name='${path}'`)).toBe(0);
  }
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));if(before.enabled===undefined)delete process.env.MEDBRIDGE_DOCUMENT_SCANNER_ENABLED;else process.env.MEDBRIDGE_DOCUMENT_SCANNER_ENABLED=before.enabled;if(before.token===undefined)delete process.env.MEDBRIDGE_DOCUMENT_SCANNER_TOKEN;else process.env.MEDBRIDGE_DOCUMENT_SCANNER_TOKEN=before.token;}
},180000);
