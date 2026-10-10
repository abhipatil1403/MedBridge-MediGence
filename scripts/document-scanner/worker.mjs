// Private outbound-only worker. No Supabase or patient credentials required.
import {scanBytes} from './engine.mjs';
import {createHash} from 'node:crypto';
let origin;
try{origin=new URL(process.env.MEDBRIDGE_SCANNER_ORIGIN??'');}
catch{throw new Error('Scanner configuration unavailable.');}
if(origin.protocol!=='https:'&&!(origin.protocol==='http:'&&origin.hostname==='127.0.0.1'))throw new Error('HTTPS scanner origin required.');
if(origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')throw new Error('Use a bare approved origin.');
const token=process.env.MEDBRIDGE_DOCUMENT_SCANNER_TOKEN;if(!token||token.length<32)throw new Error('Server-side scanner credential required.');
const base=new URL('/api/internal/document-scans',origin),headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
async function post(body){const r=await fetch(base,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error'});if(!r.ok)throw new Error('scanner_request_failed');return r.json();}
async function once(){
 const {job}=await post({action:'claim'});if(!job)return;
 if(!/^[a-f0-9-]{36}$/.test(job.id)||!/^[a-f0-9-]{36}$/.test(job.lease)||!/^[a-f0-9]{64}$/.test(job.checksum)||!Number.isInteger(job.size)||job.size<1||job.size>3145728)throw new Error('scanner_job_invalid');
 let result;
 try{
  const url=new URL(base);url.searchParams.set('id',job.id);url.searchParams.set('lease',job.lease);
  const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!r.ok||Number(r.headers.get('content-length'))!==job.size)throw new Error('payload');
  const reader=r.body.getReader(),parts=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>job.size)throw new Error('size');parts.push(value);}}finally{await reader.cancel();}
  const bytes=Buffer.concat(parts);if(size!==job.size||createHash('sha256').update(bytes).digest('hex')!==job.checksum)throw new Error('checksum');
  result=await scanBytes(bytes);
 }catch{result={checksum:job.checksum,state:'scan_failed',category:'integrity'};}
 await post({action:'result',id:job.id,lease:job.lease,result});
 console.log(JSON.stringify({event:'document_scan_finished',state:result.state}));
}
do{try{await once();}catch{console.error(JSON.stringify({event:'document_scanner_unavailable'}));if(process.argv.includes('--once'))process.exitCode=1;}if(process.argv.includes('--once'))break;await new Promise(resolve=>setTimeout(resolve,10000));}while(true);
