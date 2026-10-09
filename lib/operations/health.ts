import { healthResultSchema, failureCategory, transientFailures, type HealthResult } from './contracts';

type Probe=(signal:AbortSignal)=>Promise<{storage:boolean}>;
/** A maximum of two safe read probes, with an actual abort and a bounded deadline. */
export async function probeReadiness(probe:Probe, aiConfigured:boolean, timeoutMs=2000):Promise<HealthResult>{
  const started=performance.now();let category:ReturnType<typeof failureCategory>|undefined;let attempts=0;
  for(attempts=1;attempts<=2;attempts++){
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      const result=await Promise.race([probe(controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject({code:'TIMEOUT'});},timeoutMs);})]);
      return healthResultSchema.parse({checkedAt:new Date().toISOString(),status:'ready',database:'available',storage:result.storage?'private_bucket_present':'not_configured',ai:aiConfigured?'configured_not_probed':'not_configured',externalDelivery:'not_configured',externalMonitoring:'not_configured',durationMs:Math.round(performance.now()-started),attempts});
    }catch(error){const safe=error as {code?:string;name?:string};category=failureCategory(safe?.code??safe?.name);if(!transientFailures.has(category)||attempts===2)break;await new Promise(resolve=>setTimeout(resolve,100));}
    finally{if(timer)clearTimeout(timer);}
  }
  return healthResultSchema.parse({checkedAt:new Date().toISOString(),status:'not_ready',database:category==='timeout'?'timeout':'unavailable',storage:'not_measured',ai:aiConfigured?'configured_not_probed':'not_configured',externalDelivery:'not_configured',externalMonitoring:'not_configured',durationMs:Math.round(performance.now()-started),attempts,category});
}
export class ReadinessCache {
  private value?:HealthResult;private pending?:Promise<HealthResult>;private savedAt=0;
  constructor(private readonly now=Date.now){}
  async get(probe:()=>Promise<HealthResult>,fresh=false){
    const ttl=this.value?.status==='ready'?30000:5000;
    if(!fresh&&this.value&&this.now()-this.savedAt<ttl)return this.value;
    if(this.pending)return this.pending;
    this.pending=probe().then(value=>{this.value=value;this.savedAt=this.now();return value;}).finally(()=>{this.pending=undefined;});
    return this.pending;
  }
}
