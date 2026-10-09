// Local disposable PostgreSQL only. Fixtures remain solely in the disposable DB.
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const url=process.env.MEDBRIDGE_TYPES_DB_URL;
if(!url || !/^postgresql:\/\/postgres@127\.0\.0\.1:5441\/production_catalog_/.test(url))throw new Error('Disposable local operations database required');
const pg=process.env.MEDBRIDGE_PSQL_PATH || 'psql';
const sql=text=>execFileSync(pg,['-X','-w','-q','-tA',url,'-v','ON_ERROR_STOP=1','-c',text],{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const actor=randomUUID(),operation=randomUUID();
sql(`insert into auth.users(id,email) values('${actor}','operations-concurrency@qa.invalid');insert into public.staff_roles(user_id,role) values('${actor}','super_admin');`);
const input=JSON.stringify({operationId:operation,confirmed:true,category:'application',severity:'low',ownerId:actor});
const command=`begin;set local role authenticated;set local "request.jwt.claim.sub"='${actor}';select public.operations_command('operations_incident_create','${input}'::jsonb);commit;`;
await Promise.all(Array.from({length:8},()=>new Promise((resolve,reject)=>{
 const child=spawn(pg,['-X','-w','-q','-tA',url,'-v','ON_ERROR_STOP=1','-c',command],{stdio:['ignore','pipe','pipe']});
 child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('Concurrent command failed')));
})));
const result=JSON.parse(sql(`select json_build_object('incidents',(select count(*) from public.operational_incidents where created_by='${actor}'),'audits',(select count(*) from public.audit_events where actor_id='${actor}' and event_name like 'operations.command.%'),'notifications',(select count(*) from public.portal_notifications where user_id='${actor}' and resource_type='operational_incident'))`));
if(result.incidents!==1||result.audits!==1||result.notifications!==1)throw new Error('Concurrent retry duplicated a persisted effect');
console.log('PASS eight simultaneous commands: one incident, one audit, one notification per recipient');
