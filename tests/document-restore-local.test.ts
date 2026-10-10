import {it,expect,vi} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,copyFileSync,unlinkSync,existsSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from '@/types/database';
vi.mock('server-only',()=>({}));
import {localSqlClient} from './fixtures/local-sql-client';
import {documentWorkspaceSchema} from '@/lib/documents/schemas';
import {newUpload,documentPath} from '@/lib/documents/coordination';
import {coordinateDocument} from '@/lib/documents/service';
import {SupabaseDocumentStore} from '@/lib/documents/store';
import {completeDeletion} from '@/lib/documents/deletion';
import {scannedDownload} from '@/lib/documents/security';

it.skipIf(process.env.MEDBRIDGE_RETENTION_RESTORE_QA!=='1')('genuine local pg_dump/pg_restore and file backup with deletion and consent delta reconciliation',async()=>{
 const base=process.env.MEDBRIDGE_LOCAL_WORKFLOW_DB!;localSqlClient(base,'postgres');
 const pg=process.env.MEDBRIDGE_QA_PSQL!,target=new URL(base),nonce=randomUUID().replaceAll('-','').slice(0,8);
 const sourceName=`production_catalog_restore_source_${nonce}_agentic_20261010`,restoreName=`production_catalog_restore_target_${nonce}_agentic_20261010`;
 const adminUrl=new URL(base);adminUrl.pathname='/postgres';
 const adminSql=(q:string)=>execFileSync(pg,['-X','-w',adminUrl.href,'-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8'});
 adminSql(`create database ${sourceName} template ${target.pathname.slice(1)}`);
 const sourceUrl=new URL(base);sourceUrl.pathname=`/${sourceName}`;
 const restoreUrl=new URL(base);restoreUrl.pathname=`/${restoreName}`;
 let root=localSqlClient(sourceUrl.href,'postgres');
 const artifact=resolve(process.env.MEDBRIDGE_RETENTION_QA_ARTIFACTS!);if(!artifact.includes('medbridge-retention-20261010'))throw new Error('Dedicated QA artifact directory required');
 const dir=join(artifact,nonce),live=join(dir,'source-objects'),snapshot=join(dir,'object-backup'),restored=join(dir,'restored-objects');
 for(const path of [live,snapshot,restored])mkdirSync(path,{recursive:true});
 const owner=randomUUID(),other=randomUUID(),staff=randomUUID(),conversation=randomUUID(),caseId=randomUUID();
 root.sql(`insert into auth.users(id,email) values('${owner}','restore-owner-${nonce}@qa.invalid'),('${other}','restore-other-${nonce}@qa.invalid'),('${staff}','restore-staff-${nonce}@qa.invalid');insert into public.staff_roles(user_id,role) values('${staff}','support_agent');insert into public.conversations(id,owner_id) values('${conversation}','${owner}');select to_json(true)`);
 const hospital=root.sql('select to_json(id) from public.hospitals limit 1') as string,now=new Date().toISOString();
 const w=documentWorkspaceSchema.parse({id:randomUUID(),ownerId:owner,conversationId:conversation,hospitalId:hospital,hospitalName:'QA harmless restore',serviceId:null,serviceLabel:'QA selected',revision:0,requirements:[],documents:[],requirementLookup:'unavailable',createdAt:now,updatedAt:now});
 const bytes=Buffer.from('%PDF-1.7\nHarmless isolated retention fixture\n%%EOF');
 for(let i=0;i<3;i++)w.documents.push(newUpload(w,{filename:`fixture-${i}.pdf`,mimeType:'application/pdf',bytes}));
 const literal=(v:unknown)=>`'${JSON.stringify(v).replaceAll("'","''")}'`;
 expect((await localSqlClient(sourceUrl.href,'service_role').db.rpc('save_document_workspace',{p_workspace:JSON.parse(JSON.stringify(w)),p_expected_revision:-1,p_action:'qa_start'})).error).toBeNull();
 const paths=w.documents.map(d=>documentPath(w.id,d)),jobs:string[]=[];
 for(let i=0;i<paths.length;i++){
  const r=await localSqlClient(sourceUrl.href,'service_role').db.rpc('document_security_register' as never,{p_bucket:'care-documents',p_path:paths[i],p_checksum:w.documents[i].checksum,p_size:bytes.length,p_mime:'application/pdf'} as never);
  expect(r.error).toBeNull();jobs.push((r.data as unknown as {id:string}).id);
  root.sql(`insert into storage.objects(bucket_id,name) values('care-documents','${paths[i]}');update public.document_security_jobs set state='${i===1?'quarantined':'clean'}',engine_version='1.4.6',scanned_at=now(),signature_at=now() where id='${jobs[i]}';select to_json(true)`);
  // Contract verdict fixture, not malware detection evidence. Prior real-engine evidence is separate.
  writeFileSync(join(live,`${w.documents[i].id}.pdf`),bytes);copyFileSync(join(live,`${w.documents[i].id}.pdf`),join(snapshot,`${w.documents[i].id}.pdf`));
 }
 root.sql(`insert into public.document_retention_holds(security_job_id,active,category,applied_by) values('${jobs[2]}',true,'legal_review','${staff}');insert into public.support_cases(id,patient_id,title,assigned_to,consent_granted_at) values('${caseId}','${owner}','QA harmless consent restore','${staff}',now());select to_json(true)`);
 const caseAccess=(url:string,actor:string)=>localSqlClient(url,'authenticated',actor).sql(`select to_json(private.portal_case_access('${caseId}'))`);
 expect(caseAccess(sourceUrl.href,staff)).toBe(true);
 const dumped=performance.now(),dumpFile=join(dir,'qa-database.dump');
 execFileSync(join(dirname(pg),'pg_dump.exe'),['-w','-Fc','-f',dumpFile,sourceUrl.href],{timeout:120000});
 const dumpMs=Math.round(performance.now()-dumped);
 function storageClient(url:string,folder:string) {
  const db=localSqlClient(url,'service_role').db;
  return {...db,storage:{from:()=>({
   remove:async(names:string[])=>{for(const name of names){if(!paths.includes(name))throw new Error('QA object outside fixture');const file=join(folder,`${name.split('/').at(-1)}`);if(existsSync(file))unlinkSync(file);root.sql(`delete from storage.objects where bucket_id='care-documents' and name='${name}';select to_json(true)`);}return {error:null};},
   info:async(name:string)=>({data:existsSync(join(folder,name.split('/').at(-1)!))?{}:null,error:existsSync(join(folder,name.split('/').at(-1)!))?null:{status:404}}),
   download:async(name:string)=>({data:new Blob([readFileSync(join(folder,name.split('/').at(-1)!))]),error:null})
  })}} as unknown as SupabaseClient<Database>;
 }
 let client=storageClient(sourceUrl.href,live);const store=new SupabaseDocumentStore(client,localSqlClient(sourceUrl.href,'authenticated',owner).db);
 const input={workspaceId:w.id,documentId:w.documents[0].id},auth={ownerId:owner,conversationId:conversation,workspaceId:w.id,command:{tool:'remove_document' as const,input}};
 await coordinateDocument('remove_document',input,owner,auth,store);
 expect(existsSync(join(live,`${w.documents[0].id}.pdf`))).toBe(false);
 const deletion=root.sql(`select row_to_json(q) from public.document_deletion_jobs q where workspace_id='${w.id}'`) as {id:string;state:string};expect(deletion.state).toBe('deleted');
 await coordinateDocument('remove_document',input,owner,auth,store);
 expect(root.sql(`select to_json(count(*)) from public.document_coordination_audit where workspace_id='${w.id}' and action='remove_document'`)).toBe(1);
 expect((await localSqlClient(sourceUrl.href,'authenticated',owner).db.rpc('support_command',{p_action:'revoke_consent',p_input:{caseId}})).error).toBeNull();
 expect(caseAccess(sourceUrl.href,staff)).toBe(false);
 const revoked=root.sql(`select to_json(consent_revoked_at) from public.support_cases where id='${caseId}'`);
 const latestWorkspace=root.sql(`select to_json(data) from public.document_workspaces where id='${w.id}'`);
 // A real separate QA delta file; production has no independently configured ledger.
 writeFileSync(join(dir,'post-snapshot-delta.json'),JSON.stringify({deletion,latestWorkspace,revoked}));
 adminSql(`create database ${restoreName}`);const started=performance.now();
 execFileSync(join(dirname(pg),'pg_restore.exe'),['-w','--exit-on-error','--dbname',restoreUrl.href,dumpFile],{timeout:120000});
 root=localSqlClient(restoreUrl.href,'postgres');root.sql('update private.document_recovery_gate set blocked=true;select to_json(true)');
 for(const d of w.documents)copyFileSync(join(snapshot,`${d.id}.pdf`),join(restored,`${d.id}.pdf`));
 client=storageClient(restoreUrl.href,restored);
 expect(caseAccess(restoreUrl.href,staff)).toBe(false);expect(caseAccess(restoreUrl.href,owner)).toBe(false);
 await expect(scannedDownload(client,'care-documents',paths[0])).rejects.toThrow();
 expect(root.sql(`select to_json(consent_revoked_at is null) from public.support_cases where id='${caseId}'`)).toBe(true);
 // Replay independently retained latest data before any return to service.
 root.sql(`insert into public.document_deletion_jobs select * from jsonb_populate_record(null::public.document_deletion_jobs,${literal(deletion)});update public.document_workspaces set data=${literal(latestWorkspace)},revision=1 where id='${w.id}';update public.support_cases set consent_revoked_at=(${literal(revoked)}::jsonb#>>'{}')::timestamptz where id='${caseId}';select to_json(public.document_deletion_reconcile())`);
 expect(root.sql(`select to_json(state) from public.document_deletion_jobs where id='${deletion.id}'`)).toBe('queued');
 await completeDeletion(client,deletion.id);expect(existsSync(join(restored,`${w.documents[0].id}.pdf`))).toBe(false);
 expect(root.sql(`select to_json(count(*)) from storage.objects where name='${paths[0]}'`)).toBe(0);
 expect(root.sql(`select to_json(active) from public.document_retention_holds where security_job_id='${jobs[2]}'`)).toBe(true);
 expect(root.sql(`select to_json(state) from public.document_security_jobs where id='${jobs[1]}'`)).toBe('quarantined');
 root.sql('update private.document_recovery_gate set blocked=false;select to_json(true)');
 expect(caseAccess(restoreUrl.href,staff)).toBe(false);expect(caseAccess(restoreUrl.href,owner)).toBe(true);expect(caseAccess(restoreUrl.href,other)).toBe(false);
 await expect(scannedDownload(client,'care-documents',paths[0])).rejects.toThrow();await expect(scannedDownload(client,'care-documents',paths[1])).rejects.toThrow();
 expect(Buffer.from(await scannedDownload(client,'care-documents',paths[2]))).toEqual(bytes);
 root.sql('delete from private.document_recovery_gate;select to_json(true)');
 await expect(scannedDownload(client,'care-documents',paths[2])).rejects.toThrow();
 expect(caseAccess(restoreUrl.href,owner)).toBe(false);
 root.sql('insert into private.document_recovery_gate values(true,false);select to_json(true)');
 expect(createHash('sha256').update(readFileSync(join(restored,`${w.documents[2].id}.pdf`))).digest('hex')).toBe(w.documents[2].checksum);
 expect(localSqlClient(restoreUrl.href,'authenticated',owner).sql("select to_json(count(*)) from storage.objects where bucket_id='care-documents'")).toBe(0);
 expect(localSqlClient(restoreUrl.href,'authenticated',other).sql(`select to_json(count(*)) from public.document_workspaces where id='${w.id}'`)).toBe(0);
 writeFileSync(join(dir,'evidence.json'),JSON.stringify({kind:'isolated PostgreSQL dump/restore and actual local filesystem object snapshot',sourceName,restoreName,dumpBytes:readFileSync(dumpFile).length,objectsBackedUp:3,objectsDeletedAfterReconciliation:1,dumpMs,restoreAndReconciliationMs:Math.round(performance.now()-started),rpoApproved:false,rtoApproved:false,productionStorageExercised:false,scanEvidence:'contract fixture only; no new real scanner test',result:'passed'},null,2));
},180000);
