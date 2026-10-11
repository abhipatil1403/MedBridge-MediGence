import {afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// JavaScript helper is also directly executable by the Node CI launcher.
// @ts-expect-error No declaration file is needed for the CI-only ESM helper.
import {startOwnedCluster,redactStartup} from '../scripts/ci/postgres-startup.mjs';

const directories:string[]=[];
afterEach(()=>{vi.restoreAllMocks();for(const path of directories.splice(0))rmSync(path,{recursive:true,force:true});});
function fixture(){
  const directory=mkdtempSync(join(tmpdir(),'medbridge-startup-test-'));directories.push(directory);
  const data=join(directory,'data'),log=join(directory,'postgres.log');mkdirSync(data);
  writeFileSync(join(data,'postgresql.conf'),'# fresh QA cluster\n');
  writeFileSync(log,'FATAL: could not create lock file "/var/run/postgresql/.s.PGSQL.34541.lock": Permission denied\n');
  return {directory,data,log,port:34541};
}
function failure(status:number){return Object.assign(new Error('controlled launch failure'),{status,stdout:'',stderr:''});}
it('disables the unwritable PGDG Unix socket and verifies readiness before returning',()=>{
  const input=fixture();
  const run=vi.fn((name:string,args:string[])=>{
    if(name==='pg_ctl'&&args.includes('start'))expect(readFileSync(join(input.data,'postgresql.conf'),'utf8')).toContain("unix_socket_directories = ''");
    return 'accepting connections';
  });
  startOwnedCluster({...input,run});
  expect(run.mock.calls.map(call=>call[0])).toEqual(['pg_ctl','pg_isready','pg_ctl']);
  expect(run.mock.calls[1][1]).toContain('127.0.0.1');
  expect(JSON.parse(readFileSync(join(input.directory,'startup-diagnostics.json'),'utf8')).ready).toBe(true);
});
it('fails startup and exports status, health and the actual lock-file diagnostic',()=>{
  const input=fixture();vi.spyOn(console,'error').mockImplementation(()=>{});
  const run=vi.fn((name:string,args:string[])=>{if(name==='pg_ctl'&&args.includes('start'))throw failure(1);if(name==='pg_isready')throw failure(2);throw failure(3);});
  expect(()=>startOwnedCluster({...input,run})).toThrow('controlled launch failure');
  const evidence=JSON.parse(readFileSync(join(input.directory,'startup-diagnostics.json'),'utf8'));
  expect(evidence).toMatchObject({ready:false,status:{exit:3},health:{exit:2}});
  expect(evidence.serverLog).toContain('Permission denied');
});
it.each([1,2,3])('rejects nonready health status %i even if pg_ctl start returned success',status=>{
  const input=fixture();vi.spyOn(console,'error').mockImplementation(()=>{});
  const run=vi.fn((name:string)=>{if(name==='pg_isready')throw failure(status);return 'running';});
  expect(()=>startOwnedCluster({...input,run})).toThrow('did not pass loopback readiness');
  expect(JSON.parse(readFileSync(join(input.directory,'startup-diagnostics.json'),'utf8')).ready).toBe(false);
});
it('redacts configured secrets, connection URLs, bearer values and passwords',()=>{
  const secret=['test','credential','value'].join('-');
  expect(redactStartup(`${secret} postgresql://host/db password=example Bearer example`,[secret])).toBe('[REDACTED] postgresql://[REDACTED] password=[REDACTED] Bearer [REDACTED]');
});
it('exports only a bounded redacted startup snapshot and handles missing server logs',()=>{
  const input=fixture();
  startOwnedCluster({...input,log:join(input.directory,'absent'),run:()=> 'x'.repeat(20000)});
  const evidence=JSON.parse(readFileSync(join(input.directory,'startup-diagnostics.json'),'utf8'));
  expect(evidence.status.output.length).toBe(8192);
  expect(evidence.serverLog).toBe('Startup log unavailable.');
});
