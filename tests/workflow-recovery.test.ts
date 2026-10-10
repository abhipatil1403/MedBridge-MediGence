import { randomUUID } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only',()=>({}));
import { AgentError } from '@/lib/agents/errors';
import { ExecutionState, AGENT_LIMITS } from '@/lib/agents/execution-state';
import { executeRegisteredTool } from '@/lib/agents/tool-execution';
import { toolRegistry } from '@/lib/agents/tools';
import { runAgent } from '@/lib/agents/runtime';
import { orchestrate } from '@/lib/agents/orchestrator';
import { catalogSignature, RECOVERY_IDLE_MS, recoveryAvailability, recoveryCheckpointSchema, restoreCatalogReads } from '@/lib/agents/recovery';
import { ExecutionActivity } from '@/components/assistant/execution-activity';
import { ResponseBlocks } from '@/components/assistant/assistant-workspace';
import { ExperienceProvider } from '@/components/experience/provider';
import { SupabaseAgentStore, type AgentStore } from '@/lib/agents/persistence';
import type { AgentPlan } from '@/lib/agents/schemas';
import { harness, tools, snapshot, hospital, pkg, userId, unavailable } from './fixtures/comparison-harness';

const caseAccess={readContext:async()=>({}),readDocumentMetadata:async()=>[]};
const toolContext={agent:'treatment_planning' as const,userId,caseAccess};
function memory(){
  const saved:Record<string,unknown>[]=[],actions:string[]=[],messages:string[]=[];
  const store:AgentStore={createConversation:async()=>randomUUID(),assertConversation:async()=>{},startRun:vi.fn(async()=>randomUUID()),
    createTask:async()=>randomUUID(),updateTask:async()=>{},addMessage:async(_id,role)=>{messages.push(role);},
    recordAction:async(_r,_t,tool)=>{actions.push(tool);return undefined;},saveOutput:async()=>{},finishRun:async()=>{},
    saveExecutionState:async(_r,state)=>{saved.push(structuredClone(state));},abandonUnfinishedTasks:vi.fn(async()=>{})};
  return {store,saved,actions,messages};
}
const plan:AgentPlan={agent:'treatment_planning',understanding:'Read sourced hospital and package information',missingInformation:null,
  steps:[{tool:'get_hospital_details',objective:'Read hospital',input:JSON.stringify({slug:hospital.slug})},
    {tool:'get_package_details',objective:'Read package',input:JSON.stringify({slug:pkg.slug})}]};
async function interrupted(){
  const m=memory(),conversationId=randomUUID(),state=new ExecutionState(randomUUID(),conversationId,userId,'Read hospital and package information','Read sourced records',m.store);
  state.checkpoint={request:{content:state.request,conversationId},plan,snapshotSignature:catalogSignature(snapshot),recoverable:true,recoveryCount:0};
  await state.transition('planning');await executeRegisteredTool(state,{tool:'get_hospital_details',input:{slug:hospital.slug}},toolContext,tools);
  state.begin('get_package_details','1',{slug:pkg.slug});await state.transition('executing');
  const raw=structuredClone(m.saved.at(-1)!);raw.updatedAt=new Date(Date.now()-RECOVERY_IDLE_MS-1).toISOString();
  return {...m,state,prior:recoveryCheckpointSchema.parse(raw)};
}
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it('keeps completed step evidence visible in the saved response',async()=>{
  const h=harness(),response=await h.send('Find knee replacement hospitals in Mumbai, show packages and compare them.');
  const html=renderToStaticMarkup(createElement(ExperienceProvider,{initial:{locale:'en',currency:'USD'}},createElement(ResponseBlocks,{response,onDecision:()=>{},disabled:false})));
  expect(html).toContain('Recorded agent activity');expect(html).toContain('View activity');
  expect(html).toContain('Search hospitals');expect(html).toContain('Search packages');
});
describe('bounded transient read retry',()=>{
  it('persists retry attempts and succeeds without duplicate logical steps',async()=>{
    const m=memory(),s=new ExecutionState(randomUUID(),randomUUID(),userId,'Read records','Read records',m.store);await s.transition('planning');
    const execute=vi.spyOn(toolRegistry.get_hospital_details,'execute').mockRejectedValueOnce(new AgentError('CATALOG_UNAVAILABLE','Retry later'));
    const result=await executeRegisteredTool(s,{tool:'get_hospital_details',input:{slug:hospital.slug}},toolContext,tools);
    expect(result.status).toBe('completed');expect(execute).toHaveBeenCalledTimes(2);expect(s.calls).toHaveLength(1);expect(s.executions).toBe(2);
    expect(m.saved.some(v=>JSON.stringify(v).includes('"retrying":true'))).toBe(true);expect(s.activity().steps[0]).toMatchObject({attempts:2,retrying:false,status:'completed'});
  });
  it('fails after two attempts and preserves earlier evidence',async()=>{
    const {state}=await interrupted();state.state='observing';state.calls.pop();
    const execute=vi.spyOn(toolRegistry.get_package_details,'execute').mockRejectedValue(new AgentError('CATALOG_UNAVAILABLE','Private upstream text'));
    const result=await executeRegisteredTool(state,{tool:'get_package_details',input:{slug:pkg.slug}},toolContext,tools);
    expect(execute).toHaveBeenCalledTimes(2);expect(result.status).toBe('failed');expect(result.error?.message).not.toContain('Private');expect(state.calls[0].output?.findings).toHaveLength(1);
  });
  it.each(['TOOL_INPUT_INVALID','TOOL_DENIED','TOOL_OUTPUT_INVALID','DATABASE_FAILURE','UNKNOWN'])('does not retry %s',async code=>{
    const {state}=await interrupted();state.state='observing';state.calls.pop();const execute=vi.spyOn(toolRegistry.get_package_details,'execute').mockRejectedValue(new AgentError(code,'Unavailable'));
    await executeRegisteredTool(state,{tool:'get_package_details',input:{slug:pkg.slug}},toolContext,tools);expect(execute).toHaveBeenCalledOnce();
  });
  it('does not retry an unknown exception',async()=>{
    const {state}=await interrupted();state.state='observing';state.calls.pop();const execute=vi.spyOn(toolRegistry.get_package_details,'execute').mockRejectedValue(new Error('Raw error'));
    await executeRegisteredTool(state,{tool:'get_package_details',input:{slug:pkg.slug}},toolContext,tools);expect(execute).toHaveBeenCalledOnce();
  });
  it('does not exceed the remaining invocation budget',async()=>{
    const {state}=await interrupted();state.state='observing';state.calls.pop();state.executions=AGENT_LIMITS.maxToolCalls-1;
    const execute=vi.spyOn(toolRegistry.get_package_details,'execute').mockRejectedValue(new AgentError('CATALOG_UNAVAILABLE','Unavailable'));
    await executeRegisteredTool(state,{tool:'get_package_details',input:{slug:pkg.slug}},toolContext,tools);expect(execute).toHaveBeenCalledOnce();expect(state.executions).toBe(8);
  });
});
describe('owned interrupted workflow recovery',()=>{
  it('resumes the same run and reuses only validated reads with unchanged publication',async()=>{
    const m=await interrupted();expect(recoveryAvailability(m.prior).eligible).toBe(true);
    const hospitalRead=vi.spyOn(toolRegistry.get_hospital_details,'execute'),packageRead=vi.spyOn(toolRegistry.get_package_details,'execute');
    const result=await runAgent(m.prior.checkpoint.request,{userId,caseAccess,store:m.store,provider:unavailable,recovery:m.prior,tools:{...tools,evaluationSnapshot:snapshot},
      execution:{plan,allowModelFollowUps:false,synthesis:{summary:'Review the sourced records.',question:null,nextSteps:[]}}});
    expect(result.runId).toBe(m.prior.runId);expect(hospitalRead).not.toHaveBeenCalled();expect(packageRead).toHaveBeenCalledOnce();
    expect(result.findings).toHaveLength(2);expect(result.activity?.state).toBe('completed');expect(result.activity?.steps.some(s=>s.status==='reused')).toBe(true);
    expect(m.store.startRun).not.toHaveBeenCalled();expect(m.actions).toEqual(['get_package_details']);expect(m.messages).toEqual(['assistant']);
    expect(m.saved.at(-1)?.checkpoint).toMatchObject({recoveryCount:1});expect(m.store.abandonUnfinishedTasks).toHaveBeenCalledWith(result.runId);
  });
  it('preserves successful results after a permanent failure during recovery',async()=>{
    const m=await interrupted();vi.spyOn(toolRegistry.get_package_details,'execute').mockRejectedValue(new AgentError('TOOL_DENIED','Unavailable'));
    const response=await runAgent(m.prior.checkpoint.request,{userId,caseAccess,store:m.store,provider:unavailable,recovery:m.prior,tools:{...tools,evaluationSnapshot:snapshot},
      execution:{plan,allowModelFollowUps:false,synthesis:{summary:'Review the sourced records.',question:null,nextSteps:[]}}});
    expect(response.activity?.state).toBe('partially_completed');expect(response.findings).toHaveLength(1);expect(response.summary).toContain('could not be completed');
  });
  it('never reuses changed or unpublished evidence',async()=>{
    const m=await interrupted(),changed={...snapshot,hospitals:[]};const s=new ExecutionState(m.prior.runId,m.prior.conversationId,userId,m.state.request,'Read',m.store);
    restoreCatalogReads(s,m.prior,catalogSignature(changed));expect(s.cache.size).toBe(0);expect(s.warnings[0]).toContain('changed');
  });
  it('rejects cross-user restoration',async()=>{
    const m=await interrupted(),s=new ExecutionState(m.prior.runId,m.prior.conversationId,randomUUID(),m.state.request,'Read',m.store);
    expect(()=>restoreCatalogReads(s,m.prior,catalogSignature(snapshot))).toThrowError(AgentError);
  });
  it('refuses active, completed, already recovered and case-linked runs',async()=>{
    const {prior}=await interrupted();expect(recoveryAvailability({...prior,updatedAt:new Date().toISOString()}).eligible).toBe(false);
    expect(recoveryAvailability({...prior,state:'completed'}).eligible).toBe(false);
    expect(recoveryAvailability({...prior,checkpoint:{...prior.checkpoint,recoveryCount:1}}).eligible).toBe(false);
    expect(recoveryAvailability({...prior,checkpoint:{...prior.checkpoint,request:{...prior.checkpoint.request,caseId:randomUUID()}}}).eligible).toBe(false);
  });
  it.each(['create_case','request_external_action','upload_document','get_inquiry_context','get_recovery_context','get_case_context','research_healthcare_information'])('does not recover %s',async tool=>{
    const {prior}=await interrupted();const changed={...prior,calls:[{...prior.calls[0],tool}]};expect(recoveryAvailability(changed).eligible).toBe(false);
  });
  it('checks ownership before reading private recovery state',async()=>{
    const db={from:vi.fn()},store=new SupabaseAgentStore(db as never,{} as never);vi.spyOn(store,'assertConversation').mockRejectedValue(new AgentError('CONVERSATION_ACCESS_DENIED','Unavailable'));
    await expect(store.loadRecovery(randomUUID(),randomUUID(),randomUUID())).rejects.toMatchObject({code:'CONVERSATION_ACCESS_DENIED'});expect(db.from).not.toHaveBeenCalled();
  });
  it('rejects a tool context belonging to another run owner',async()=>{
    const {state}=await interrupted();state.state='observing';state.calls.pop();const invoke=vi.spyOn(toolRegistry.get_package_details,'execute');
    const result=await executeRegisteredTool(state,{tool:'get_package_details',input:{slug:pkg.slug}},{...toolContext,userId:randomUUID()},tools);
    expect(result.error?.code).toBe('TOOL_DENIED');expect(invoke).not.toHaveBeenCalled();
  });
  it('returns an already saved result on a duplicate resume without creating tasks',async()=>{
    const h=harness(),first=await h.send('Find knee replacement hospitals in Mumbai, show packages and compare them.');
    h.store.loadRecovery=vi.fn(async()=>first);const create=vi.spyOn(h.store,'createTask');
    const returned=await orchestrate({content:'Resume',conversationId:first.conversationId,resumeRunId:first.runId},{userId,caseAccess,store:h.store,planningStore:h.planningStore,provider:unavailable,tools});
    expect(returned.runId).toBe(first.runId);expect(create).not.toHaveBeenCalled();expect(h.planningStore.locks.size).toBe(0);
  });
  it('requires the conversation lease before reading recovery',async()=>{
    const h=harness(),id=await h.store.createConversation(userId);h.planningStore.locks.set(id,'busy');h.store.loadRecovery=vi.fn();
    await expect(orchestrate({content:'Resume',conversationId:id,resumeRunId:randomUUID()},{userId,caseAccess,store:h.store,planningStore:h.planningStore,provider:unavailable,tools})).rejects.toMatchObject({code:'TURN_IN_PROGRESS'});expect(h.store.loadRecovery).not.toHaveBeenCalled();
  });
  it('renders recorded retries and failures without raw tool arguments',async()=>{
    const {state}=await interrupted();state.calls[0].attempts=2;state.calls[0].retrying=true;
    const render=()=>renderToStaticMarkup(createElement(ExperienceProvider,{initial:{locale:'en',currency:'USD'}},createElement(ExecutionActivity,{activity:state.activity()})));
    const html=render();expect(html).toContain('Retrying eligible read');expect(html).toContain('2');expect(html).not.toContain(hospital.slug);
    state.calls[0].status='failed';state.calls[0].error={code:'TOOL_TIMEOUT',message:'This read timed out.'};
    expect(render()).toContain('This read timed out.');
    state.calls[0].tool='compare_providers';state.calls[0].error={code:'TOOL_INPUT_INVALID',message:'Use {"recordIds":[...]} with returned catalog IDs.'};state.state='partially_completed';
    state.calls[0].retrying=false;
    const failed=render();expect(failed).toContain('recordIds');expect(failed).toContain('Partially complete');expect(failed).toContain('Could not complete');expect(failed).not.toContain(hospital.recordId);
  });
});
