/** Diagnostics for the freshly initialized, disposable CI cluster only. */
import {appendFileSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

export function redactStartup(text,secrets=[]){
  let value=String(text);
  for(const secret of secrets.filter(s=>typeof s==='string'&&s.length>=8))value=value.replaceAll(secret,'[REDACTED]');
  return value.replace(/(postgres(?:ql)?:\/\/)[^\s]+/gi,'$1[REDACTED]')
    .replace(/(password\s*[=:]\s*|Bearer\s+)\S+/gi,'$1[REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[REDACTED]');
}

export function startOwnedCluster({run,data,log,directory,port,secrets=[]}){
  // PGDG defaults to /var/run/postgresql on Unix, which ordinary CI users cannot
  // write. All gate clients already use loopback TCP; no Unix socket is needed.
  appendFileSync(join(data,'postgresql.conf'),"\nunix_socket_directories = ''\n");
  const safe=value=>redactStartup(value,secrets).slice(-8192);
  const inspect=(name,args)=>{
    try{return {exit:0,output:safe(run(name,args,{timeout:10000}))};}
    catch(error){return {exit:Number.isInteger(error.status)?error.status:null,output:safe((error.stdout||'')+'\n'+(error.stderr||'')),error:safe(error.message)};}
  };
  const readyArgs=['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-t','5'];
  const evidence={mode:'owned process; no service/container',ready:false,status:null,health:null,serverLog:null};
  try{
    // Avoid pipes inherited by a long-running Windows server. Capture bounded
    // process status, health and startup-only server logs separately instead.
    run('pg_ctl',['-D',data,'-l',log,'-o',`-h 127.0.0.1 -p ${port}`,'-w','-t','60','start'],{stdio:'ignore',timeout:70000});
    evidence.health=inspect('pg_isready',readyArgs);
    if(evidence.health.exit!==0)throw new Error('Owned PostgreSQL did not pass loopback readiness.');
    evidence.ready=true;
  }finally{
    evidence.status=inspect('pg_ctl',['-D',data,'status']);
    if(!evidence.health)evidence.health=inspect('pg_isready',readyArgs);
    // Snapshot before any migration or fixture SQL can reach the server log.
    try{evidence.serverLog=safe(readFileSync(log,'utf8'));}catch{evidence.serverLog='Startup log unavailable.';}
    writeFileSync(join(directory,'startup-diagnostics.json'),JSON.stringify(evidence,null,2));
    if(!evidence.ready)console.error('PostgreSQL startup diagnostics: '+JSON.stringify(evidence));
  }
}
