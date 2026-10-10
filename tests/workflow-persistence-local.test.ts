import {randomUUID,createHash} from 'node:crypto';
import {it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/supabase/server',async()=>{
  const {localSqlClient}=await import('./fixtures/local-sql-client');
  return {getPublicSupabaseClient:()=>localSqlClient(process.env.MEDBRIDGE_LOCAL_WORKFLOW_DB!,'anon').db};
});
import {localSqlClient} from './fixtures/local-sql-client';
import {SupabaseAgentStore} from '@/lib/agents/persistence';
import {SupabasePlanningStore} from '@/lib/agents/treatment-planning/store';
import {orchestrate} from '@/lib/agents/orchestrator';
import {ExecutionState} from '@/lib/agents/execution-state';
import {executeRegisteredTool} from '@/lib/agents/tool-execution';
import {catalogRepository} from '@/lib/catalog/repository';
import {defaultToolDependencies,toolRegistry} from '@/lib/agents/tools';
import {catalogSignature,RECOVERY_IDLE_MS} from '@/lib/agents/recovery';
import {loadDiscoverySnapshot} from '@/lib/agents/discovery-routing';
import {AgentError} from '@/lib/agents/errors';
import {RequirementExtractor} from '@/lib/requirements/RequirementExtractor';
import {parseCompoundIntent} from '@/lib/orchestration/CompoundIntentParser';
import {prepareCompoundExecution} from '@/lib/orchestration/OperationExecutor';
import {runAgent} from '@/lib/agents/runtime';

it.skipIf(!process.env.MEDBRIDGE_LOCAL_WORKFLOW_DB)('real local PostgreSQL: canonical comparison replay keeps one action, output and assistant message',async()=>{
  const root=localSqlClient(process.env.MEDBRIDGE_LOCAL_WORKFLOW_DB!,'postgres'),owner=randomUUID();
  root.sql(`insert into auth.users(id) values('${owner}');insert into public.profiles(id) values('${owner}') on conflict do nothing;grant all on all tables in schema public to service_role;grant usage on all sequences in schema public to service_role;select to_json(true)`);
  const admin=localSqlClient(process.env.MEDBRIDGE_LOCAL_WORKFLOW_DB!,'service_role').db,user=localSqlClient(process.env.MEDBRIDGE_LOCAL_WORKFLOW_DB!,'authenticated',owner).db;
  const store=new SupabaseAgentStore(admin,user),planningStore=new SupabasePlanningStore(admin,user);
  const snapshot=await loadDiscoverySnapshot(catalogRepository),packages=snapshot.packages.slice(0,2);expect(packages.length).toBeGreaterThan(0);
  const ids=packages.map(p=>p.recordId),input={recordIds:ids},content='Compare these packages with airport transfer.';
  const invoke=vi.spyOn(toolRegistry.compare_providers,'execute');
  const provider={generateStructured:async()=>{throw new AgentError('MODEL_UNAVAILABLE','Unavailable');}};
  try {
    const response=await runAgent({content},{userId:owner,store,provider,caseAccess:{readContext:async()=>({}),readDocumentMetadata:async()=>[]},
      tools:{...defaultToolDependencies,evaluationSnapshot:snapshot,requirements:RequirementExtractor.extract(content,snapshot)},
      execution:{plan:{agent:'discovery',understanding:'Compare selected catalog evidence',missingInformation:null,steps:[
        ...packages.map(p=>({tool:'get_package' as const,objective:'Read selected package',input:JSON.stringify({slug:p.slug})})),
        {tool:'compare_providers',objective:'Compare returned records',input:JSON.stringify(ids)},
        {tool:'compare_providers',objective:'Repeat equivalent comparison',input:JSON.stringify(input)}]},allowModelFollowUps:false,
        synthesis:{summary:'Compared selected catalog evidence; missing inclusions need confirmation.',question:null,nextSteps:[]}}});
    expect(response.status).toBe('completed');expect(invoke).toHaveBeenCalledTimes(1);
    const persisted=await admin.from('agent_runs').select('metadata').eq('id',response.runId).single();expect(persisted.error).toBeNull();
    const execution=(persisted.data!.metadata as unknown as {execution:{calls:Array<{tool:string;input:unknown;validatedInput:unknown;status:string}>}}).execution;
    expect(execution.calls.filter(c=>c.tool==='compare_providers')).toEqual(expect.arrayContaining([
      expect.objectContaining({input:ids,validatedInput:input,status:'completed'}),expect.objectContaining({input,validatedInput:input,status:'reused'})]));
    const actions=await admin.from('agent_actions').select('tool_name,input_hash').eq('run_id',response.runId);expect(actions.error).toBeNull();
    expect(actions.data?.filter(a=>a.tool_name==='compare_providers')).toEqual([{tool_name:'compare_providers',input_hash:createHash('sha256').update(JSON.stringify(input)).digest('hex')}]);
    root.sql(`delete from public.conversation_messages where run_id='${response.runId}' and role='assistant';select to_json(true)`);
    for(let i=0;i<2;i++) {
      const restored=await orchestrate({content:'Resume',conversationId:response.conversationId,resumeRunId:response.runId},{userId:owner,store,planningStore,provider,tools:defaultToolDependencies,caseAccess:{readContext:async()=>({}),readDocumentMetadata:async()=>[]}});
      expect(restored.runId).toBe(response.runId);expect(restored.activity?.steps).toEqual(response.activity?.steps);expect(restored.findings).toEqual(response.findings);
    }
    expect(invoke).toHaveBeenCalledTimes(1);
    expect((await admin.from('agent_actions').select('id').eq('run_id',response.runId)).data).toHaveLength(packages.length+1);
    expect((await admin.from('agent_outputs').select('id').eq('run_id',response.runId)).data).toHaveLength(1);
    expect((await user.from('conversation_messages').select('role').eq('conversation_id',response.conversationId)).data?.filter(m=>m.role==='assistant')).toHaveLength(1);
  } finally {invoke.mockRestore();}
},120000);

it.skipIf(!process.env.MEDBRIDGE_LOCAL_WORKFLOW_DB)('real local PostgreSQL: recover dependent catalog reads, persist retry failure, preserve evidence and enforce owner RLS',async()=>{
  const url=process.env.MEDBRIDGE_LOCAL_WORKFLOW_DB!,root=localSqlClient(url,'postgres'),owner=randomUUID(),other=randomUUID();
  root.sql(`insert into auth.users(id) values('${owner}'),('${other}');select to_json(true)`);
  root.sql(`insert into public.profiles(id) values('${owner}'),('${other}') on conflict do nothing;select to_json(true)`);
  // Supabase provides service-role grants; the minimal standalone bootstrap does not.
  root.sql('grant all on all tables in schema public to service_role;grant usage on all sequences in schema public to service_role;select to_json(true)');
  const admin=localSqlClient(url,'service_role').db,user=localSqlClient(url,'authenticated',owner).db;
  const store=new SupabaseAgentStore(admin,user),planningStore=new SupabasePlanningStore(admin,user);
  const snapshot=await loadDiscoverySnapshot(catalogRepository),hospital=snapshot.hospitals[0];expect(hospital).toBeDefined();
  const content=`Find hospitals for ${snapshot.treatments.find(t=>hospital.treatmentSlugs.includes(t.slug))!.name} in ${hospital.city}, show packages and compare them.`;
  const conversationId=await store.createConversation(owner);
  const lease=randomUUID();expect(await planningStore.acquire(conversationId,owner,lease)).toBe(true);
  const required=RequirementExtractor.extract(content,snapshot);
  const prepared=await prepareCompoundExecution({content,request:parseCompoundIntent(content,required)!,snapshot,userId:owner,conversationId,store:planningStore,lease});
  const runId=await store.startRun(conversationId,owner,prepared.plan.agent,undefined,prepared.carePlanId);
  await planningStore.release(conversationId,lease);
  await store.addMessage(conversationId,'user',content);
  const state=new ExecutionState(runId,conversationId,owner,content,'Discover and compare published records',store);
  const input=JSON.parse(prepared.plan.steps[0].input);
  state.agent='hospital_matching';state.checkpoint={request:{content,conversationId},plan:prepared.plan,snapshotSignature:catalogSignature(snapshot),recoverable:true,recoveryCount:0};
  await state.transition('planning');
  const context={userId:owner,agent:'hospital_matching' as const,caseAccess:{readContext:async()=>({}),readDocumentMetadata:async()=>[]}};
  const taskId=await store.createTask(runId,'hospital_matching','Read eligible published hospitals','search_hospitals');await store.updateTask(taskId,'running');
  const read=await executeRegisteredTool(state,{tool:'search_hospitals',input,taskId},context,defaultToolDependencies);expect(read.data?.findings.length).toBeGreaterThan(0);
  await store.updateTask(taskId,'completed',undefined,read.data);await store.recordAction(runId,taskId,'search_hospitals','completed',1,input,read.data);
  // Simulate a process exit after this actual saved read, only in the loopback DB.
  const prior=await admin.from('agent_runs').select('metadata').eq('id',runId).single();expect(prior.error).toBeNull();
  const metadata=prior.data!.metadata as Record<string,unknown>,execution=metadata.execution as Record<string,unknown>;
  execution.updatedAt=new Date(Date.now()-RECOVERY_IDLE_MS-1).toISOString();
  const saved=await admin.from('agent_runs').update({metadata:metadata as never}).eq('id',runId);expect(saved.error).toBeNull();
  expect((await store.readActivity(conversationId,owner))?.recovery?.eligible).toBe(true);
  const packageExecute=vi.spyOn(toolRegistry.search_packages,'execute').mockRejectedValue(new AgentError('CATALOG_UNAVAILABLE','Isolated failure gate'));
  const provider={generateStructured:async()=>{throw new AgentError('MODEL_UNAVAILABLE','Unavailable');}};
  const response=await orchestrate({content:'Resume',conversationId,resumeRunId:runId},{userId:owner,store,planningStore,provider,tools:defaultToolDependencies,caseAccess:context.caseAccess});
  expect(response.runId).toBe(runId);expect(response.findings.some(f=>f.kind==='hospitals')).toBe(true);
  expect(response.activity?.state).toBe('partially_completed');expect(response.activity?.steps.some(s=>s.status==='reused')).toBe(true);
  expect(packageExecute).toHaveBeenCalledTimes(2);expect(response.compoundRequest?.operations.find(o=>o.type==='compare_results')?.status).toBe('skipped');
  expect((await store.readActivity(conversationId,owner))?.steps).toEqual(response.activity?.steps);
  const actions=await admin.from('agent_actions').select('tool_name,status').eq('run_id',runId);expect(actions.error).toBeNull();expect(actions.data?.filter(a=>a.tool_name==='search_packages'&&a.status==='failed')).toHaveLength(1);
  expect(actions.data?.filter(a=>a.tool_name==='search_hospitals'&&a.status==='completed')).toHaveLength(1);
  // Model a saved output whose assistant message never committed, in local QA only.
  root.sql(`delete from public.conversation_messages where run_id='${runId}' and role='assistant';select to_json(true)`);
  const repeated=await orchestrate({content:'Resume',conversationId,resumeRunId:runId},{userId:owner,store,planningStore,provider,tools:defaultToolDependencies,caseAccess:context.caseAccess});expect(repeated.runId).toBe(runId);expect(packageExecute).toHaveBeenCalledTimes(2);
  const outputs=await admin.from('agent_outputs').select('id').eq('run_id',runId);expect(outputs.data).toHaveLength(1);
  const messages=await user.from('conversation_messages').select('role').eq('conversation_id',conversationId);expect(messages.data?.filter(m=>m.role==='assistant')).toHaveLength(1);
  const foreign=localSqlClient(url,'authenticated',other).db;expect((await foreign.from('conversations').select('id').eq('id',conversationId)).data).toEqual([]);
  await expect(new SupabaseAgentStore(admin,foreign).loadRecovery(conversationId,other,runId)).rejects.toMatchObject({code:'CONVERSATION_ACCESS_DENIED'});
  packageExecute.mockRestore();
},120000);
