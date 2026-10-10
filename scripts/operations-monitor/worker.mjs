/** Run on an approved independent host. No Supabase application secret required. */
import {readFile,writeFile,rename,mkdir,open,unlink} from 'node:fs/promises';
import {isAbsolute,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {collect,deliver,emptyState,observe,stateSchema} from './engine.mjs';
function endpoint(value){let u;try{u=new URL(value);}catch{throw new Error('monitor_https_endpoint_required');}if(u.username||u.password||u.hash||u.search||!(u.protocol==='https:'||u.protocol==='http:'&&u.hostname==='127.0.0.1'))throw new Error('monitor_https_endpoint_required');return u;}
const origin=endpoint(process.env.MEDBRIDGE_MONITOR_ORIGIN??'https://medbridge-medigence.vercel.app');
if(origin.pathname!=='/')throw new Error('monitor_origin_required');
const statePath=process.env.MEDBRIDGE_MONITOR_STATE_PATH;
if(!statePath||!isAbsolute(statePath))throw new Error('monitor_absolute_private_state_path_required');
const token=process.env.MEDBRIDGE_MONITOR_TOKEN;
if(token&&token.length<32)throw new Error('monitor_credential_invalid');
const url=process.env.MEDBRIDGE_OPS_ALERT_URL,alertToken=process.env.MEDBRIDGE_OPS_ALERT_TOKEN;
if(url)endpoint(url);
if(Boolean(url)!==Boolean(alertToken)||alertToken&&alertToken.length<32)throw new Error('monitor_alert_configuration_incomplete');
// Require an explicitly approved operational receiver. Never route to patients/providers.
if(url&&process.env.MEDBRIDGE_OPS_ALERT_APPROVED!=='true')throw new Error('monitor_alert_recipient_approval_required');
const target=createHash('sha256').update(origin.origin).digest('hex');
await mkdir(dirname(statePath),{recursive:true,mode:0o700});
let lock;
try{lock=await open(`${statePath}.lock`,'wx',0o600);}catch{throw new Error('monitor_single_worker_lock_required');}
async function persist(state){await writeFile(`${statePath}.tmp`,JSON.stringify(stateSchema.parse(state)),{mode:0o600});await rename(`${statePath}.tmp`,statePath);}
try{
 let state;
 try{state=stateSchema.parse(JSON.parse(await readFile(statePath,'utf8')));}catch(e){if(e.code!=='ENOENT')throw new Error('monitor_state_invalid');state=emptyState(target);}
 if(state.target!==target)throw new Error('monitor_state_target_mismatch');
 do{
  const observations=await collect(origin,token);
  observations.alert_delivery=state.alerts.some(a=>a.state==='failed'||a.state==='unknown'||a.state==='not_configured');
  state=observe(state,observations);await persist(state);
  await deliver(state,{url,token:alertToken},persist);
  console.log(JSON.stringify({event:'monitor_check',application:observations.application?'unavailable':'responding',dependencyProbe:!token?'not_configured':observations.dependency_probe?'unavailable':'measured',alertTransport:!url?'not_configured':state.alerts.some(a=>a.state==='failed'||a.state==='unknown')?'needs_attention':'no_failure_observed',acceptedAlerts:state.alerts.filter(a=>a.state==='accepted').length}));
  if(process.argv.includes('--once')){if(Object.values(observations).some(Boolean)||!url)process.exitCode=1;break;}
  await new Promise(resolve=>setTimeout(resolve,60000));
 }while(true);
}finally{await lock.close();await unlink(`${statePath}.lock`);}
