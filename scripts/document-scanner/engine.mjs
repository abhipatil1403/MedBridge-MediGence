import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createConnection} from 'node:net';
const execute=promisify(execFile);
export function parseStreamVerdict(output,version,now=Date.now()){
 const v=/^ClamAV (1\.\d+\.\d+)\/(\d+)\/(.+)\s*$/.exec(version.trim()),date=v?Date.parse(v[3]):NaN;
 if(!v||Number(v[2])<1||!Number.isFinite(date)||date>now+300000||date<now-48*3600000)return {state:'scan_failed',category:'inconclusive'};
 if(/Heuristics\.(?:Limits|Encrypted)/i.test(output))return {state:'scan_failed',category:'inconclusive'};
 const state=output.trim()==='stream: OK'?'clean':/^stream: [A-Za-z0-9_.-]+ FOUND$/.test(output.trim())?'quarantined':null;
 if(!state)return {state:'scan_failed',category:'malformed'};
 return {state,engine:'ClamAV',engineVersion:v[1],signatureVersion:v[2],signatureAt:new Date(date).toISOString(),policyVersion:'clamav-v1'};
}
function command(parts,timeout){
 return new Promise((resolve,reject)=>{
  const port=Number(process.env.CLAMD_PORT??3310);if(!Number.isInteger(port)||port<1||port>65535){reject(new Error('configuration'));return;}
  const socket=createConnection(process.env.CLAMD_SOCKET?{path:process.env.CLAMD_SOCKET}:{host:'127.0.0.1',port});let response='',done=false,deadline;
  const finish=(error)=>{if(done)return;done=true;clearTimeout(deadline);socket.destroy();error?reject(error):resolve(response.replace(/\0.*$/s,''));};
  // Absolute deadline also bounds a malformed peer that keeps sending fragments.
  deadline=setTimeout(()=>finish(new Error('timeout')),timeout);socket.on('error',()=>finish(new Error('unavailable')));
  socket.on('connect',()=>{for(const part of parts)socket.write(part);});
  socket.on('data',chunk=>{response+=chunk.toString('utf8');if(response.length>8192)finish(new Error('malformed'));else if(response.includes('\0'))finish();});
  socket.on('end',()=>finish(new Error('malformed')));
 });
}
export async function scanStream(bytes,timeout=60000){
 const checksum=createHash('sha256').update(bytes).digest('hex');
 try{
  if(bytes.length<1||bytes.length>3145728)return {checksum,state:'scan_failed',category:'invalid_file'};
  const version=await command([Buffer.from('zVERSION\0')],Math.min(10000,timeout)),parts=[Buffer.from('zINSTREAM\0')];
  for(let i=0;i<bytes.length;i+=65536){const chunk=bytes.subarray(i,i+65536),size=Buffer.alloc(4);size.writeUInt32BE(chunk.length);parts.push(size,chunk);}parts.push(Buffer.alloc(4));
  return {checksum,...parseStreamVerdict(await command(parts,timeout),version)};
 }catch(e){return {checksum,state:'scan_failed',category:e.message==='timeout'?'timeout':e.message==='malformed'?'malformed':'unavailable'};}
}
export function parseVerdict(code,stdout,version,now=Date.now()){
 const v=/^ClamAV (1\.\d+\.\d+)\/(\d+)\/(.+)\s*$/.exec(version.trim()),date=v?Date.parse(v[3]):NaN;
 if(!v||Number(v[2])<1||!Number.isFinite(date)||date>now+300000||date<now-48*3600000||/ERROR|WARNING|Heuristics\.(?:Limits|Encrypted)/i.test(stdout))return {state:'scan_failed',category:'inconclusive'};
 const match=/Infected files:\s*(\d+)/.exec(stdout),scanned=/Scanned files:\s*(\d+)/.exec(stdout),known=/Known viruses:\s*([1-9]\d*)/.exec(stdout);
 if(!match||!scanned||Number(scanned[1])!==1||!known)return {state:'scan_failed',category:'malformed'};
 if(!((code===0&&Number(match[1])===0)||(code===1&&Number(match[1])===1)))return {state:'scan_failed',category:'malformed'};
 return {state:code===0?'clean':'quarantined',engine:'ClamAV',engineVersion:v[1],signatureVersion:v[2],signatureAt:new Date(date).toISOString(),policyVersion:'clamav-v1'};
}
export async function scanBytes(bytes,{binary=process.env.CLAMSCAN_PATH??'clamscan',database=process.env.CLAMAV_DATABASE_DIR,timeout=60000}={}){
 if(process.env.CLAMD_PORT||process.env.CLAMD_SOCKET)return scanStream(bytes,timeout);
 const checksum=createHash('sha256').update(bytes).digest('hex');let dir;
 try{
  if(bytes.length<1||bytes.length>3145728)return {checksum,state:'scan_failed',category:'invalid_file'};
  const common=database?[`--database=${database}`]:[],version=await execute(binary,[...common,'--version'],{timeout:10000,maxBuffer:8192});
  dir=await mkdtemp(join(tmpdir(),'medbridge-scan-'));const file=join(dir,'payload');await writeFile(file,bytes,{mode:0o600});
  let code=0,stdout='';
  try{const out=await execute(binary,[...common,'--stdout','--max-filesize=3M','--max-scansize=20M','--max-recursion=16','--alert-exceeds-max=yes','--alert-encrypted=yes',file],{timeout,maxBuffer:65536});stdout=out.stdout+'\n'+out.stderr;}
  catch(e){if(e.killed)return {checksum,state:'scan_failed',category:'timeout'};if(e.code!==1)return {checksum,state:'scan_failed',category:'unavailable'};code=1;stdout=e.stdout??'';}
  return {checksum,...parseVerdict(code,stdout,version.stdout)};
 }catch{return {checksum,state:'scan_failed',category:'unavailable'};}
 finally{if(dir)await rm(dir,{recursive:true,force:true});}
}
