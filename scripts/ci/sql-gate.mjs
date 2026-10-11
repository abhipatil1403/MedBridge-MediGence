/** Own disposable loopback PostgreSQL only. Never accepts an existing DB URL. */
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,readdirSync,realpathSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';

if(process.env.MEDBRIDGE_CI_SQL!=='1')throw new Error('Explicit isolated CI SQL opt-in required.');
if(process.argv.length!==2)throw new Error('Database URLs and command arguments are not supported.');
const root=realpathSync('.'),directory=mkdtempSync(join(tmpdir(),'medbridge-ci-pg-'));
const data=join(directory,'data'),log=join(directory,'postgres.log');
const bin=process.env.MEDBRIDGE_CI_PG_BIN;
const executable=name=>bin?join(bin,name+(process.platform==='win32'?'.exe':'')):name;
// Ignore libpq environment/service configuration: every target is created below.
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^PG/i.test(key)));
let initialized=false,failed=false;
const evidence={postgres:null,migrations:0,sql:[],integration:null,clusterStopped:false};
function run(name,args,options={}){
  return execFileSync(executable(name),args,{env,cwd:root,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024,...options});
}
const server=createServer();
await new Promise((accept,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',accept);});
const port=server.address().port;
await new Promise(accept=>server.close(accept));
const nonce=randomUUID().replaceAll('-','').slice(0,10);
const base=`production_catalog_personal_ci_${nonce}`;
const packages=`production_catalog_personal_packages_ci_${nonce}_agentic_20261010`;
const inquiry=`production_catalog_personal_inquiry_ci_${nonce}_agentic_20261010`;
const connection=db=>['-X','-w','-h','127.0.0.1','-p',String(port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'];
function sql(db,file,extra=[]){
  if(![base,packages,inquiry].includes(db))throw new Error('Unknown disposable database.');
  console.log(`RUN ${file}`);
  run('psql',[...connection(db),...extra,'-f',resolve(file)]);
}
function gate(db,file){
  try{sql(db,file);evidence.sql.push({file,status:'passed'});console.log(`PASS ${file}`);}
  catch(error){evidence.sql.push({file,status:'failed'});throw error;}
}
try{
  evidence.postgres=run('psql',['--version']).trim();
  console.log(evidence.postgres);
  run('initdb',['-D',data,'-U','postgres','--auth-local=trust','--auth-host=trust','--encoding=UTF8','--locale=C']);
  initialized=true;
  // A random port, private temporary data directory and loopback bind. No shared server.
  // Do not leave captured pipes inherited by a long-running Windows server.
  run('pg_ctl',['-D',data,'-l',log,'-o',`-h 127.0.0.1 -p ${port}`,'-w','start'],{stdio:'ignore'});
  const actual=run('psql',[...connection('postgres'),'-At','-c','show data_directory']).trim();
  if(realpathSync(actual)!==realpathSync(data))throw new Error('Cluster identity mismatch.');
  run('psql',[...connection('postgres'),'-c',`create database ${base}`]);
  sql(base,'scripts/pg-validation-bootstrap.sql');
  sql(base,'scripts/pg-document-storage-bootstrap.sql');
  for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
    sql(base,`supabase/migrations/${file}`);evidence.migrations++;
    if(file==='20261010100000_production_operations.sql')sql(base,`supabase/migrations/${file}`);
  }
  sql(base,'supabase/migrations/20261010140000_operational_monitor_probe.sql');
  sql(base,'supabase/seed.sql');
  const dependent=new Set(['validate-personal-care.sql','validate-governed-packages.sql','validate-patient-inquiries.sql','validate-provider-inquiry-coordination.sql']);
  const files=readdirSync('scripts').filter(f=>/^validate-.*\.sql$/.test(f)).sort();
  for(const file of files.filter(f=>!dependent.has(f)))gate(base,`scripts/${file}`);
  run('psql',[...connection('postgres'),'-c',`create database ${packages} template ${base}`]);
  sql(packages,'scripts/validate-production-catalog.sql',['-v','keep_fixture=1']);
  gate(packages,'scripts/validate-personal-care.sql');
  gate(packages,'scripts/validate-governed-packages.sql');
  run('psql',[...connection('postgres'),'-c',`create database ${inquiry} template ${packages}`]);
  gate(inquiry,'scripts/validate-patient-inquiries.sql');
  gate(inquiry,'scripts/validate-provider-inquiry-coordination.sql');
  if(evidence.sql.length!==files.length)throw new Error('Incomplete SQL gate inventory.');
  // These three existing tests need only the just-created SQL fixture, not hosted credentials.
  const report=join(directory,'isolated-vitest.json');
  execFileSync(process.execPath,['node_modules/vitest/vitest.mjs','run','tests/workflow-persistence-local.test.ts','tests/inquiry-safety-local.test.ts'],{
    cwd:root,windowsHide:true,stdio:'inherit',timeout:180000,
    env:{...env,MEDBRIDGE_LOCAL_WORKFLOW_DB:`postgresql://postgres@127.0.0.1:${port}/${inquiry}`,MEDBRIDGE_QA_PSQL:executable('psql'),MEDBRIDGE_CI_VITEST_REPORT:report},
  });
  execFileSync(process.execPath,['scripts/ci/report-vitest.mjs',report,'--isolated'],{cwd:root,env,windowsHide:true,stdio:'inherit'});
  const result=JSON.parse(readFileSync(report,'utf8'));
  evidence.integration={passed:result.numPassedTests,failed:result.numFailedTests,skipped:result.numPendingTests};
  console.log(`PASS ${evidence.sql.length} existing SQL scripts; ${evidence.integration.passed} isolated persistence/lifecycle tests.`);
}catch(error){
  failed=true;
  console.error('Isolated SQL/RLS gate failed. No production connection was used.');
  if(error.stdout)process.stderr.write(error.stdout.toString());
  if(error.stderr)process.stderr.write(error.stderr.toString());
  console.error(error.message);
}finally{
  if(initialized){
    try{
      // Also handles a partially successful start that returned a failure.
      let running=true;
      try{run('pg_ctl',['-D',data,'status'],{stdio:'ignore'});}catch(error){if(error.status===3)running=false;else throw error;}
      if(running)run('pg_ctl',['-D',data,'-w','stop','-m','immediate'],{stdio:'ignore'});
      evidence.clusterStopped=true;
    }catch{failed=true;console.error('Owned QA cluster shutdown failed.');}
  }
  writeFileSync(join(directory,'results.json'),JSON.stringify(evidence,null,2));
  console.log(`QA evidence: ${directory}`);
  if(process.env.GITHUB_STEP_SUMMARY){
    const {appendFileSync}=await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,`\n## Isolated SQL/RLS\n\n${failed?'FAILED':'PASSED'}: ${evidence.sql.filter(r=>r.status==='passed').length}/${evidence.sql.length} executed scripts; migrations: ${evidence.migrations}; isolated Vitest: ${evidence.integration?JSON.stringify(evidence.integration):'not completed'}.\n\nPrivate cluster stopped: ${evidence.clusterStopped}. No hosted Storage, real scans or provider acceptance is established.\n`);
  }
  if(failed)process.exitCode=1;
}
