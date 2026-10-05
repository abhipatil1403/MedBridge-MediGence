import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AgentStore } from '@/lib/agents/persistence';
import type { PlanningStore } from '@/lib/agents/treatment-planning/store';
import { carePlanSchema, assistantResponseSchema } from '@/lib/agents/schemas';
import { AgentError } from '@/lib/agents/errors';
import type { ConversationMessage } from '@/lib/conversation/context';
const messageSchema=z.object({id:z.uuid(),role:z.enum(['user','assistant']),content:z.string().max(2000),metadata:z.object({response:assistantResponseSchema.optional()}),createdAt:z.iso.datetime()});
export const visitorSchema=z.object({
  userId:z.uuid(),conversationId:z.uuid(),messages:z.array(messageSchema).max(40),plan:carePlanSchema.optional(),page:z.string().optional(),
  traces:z.array(z.object({runId:z.uuid(),agent:z.string(),status:z.string(),tools:z.array(z.string()).max(12)})).max(20),
}).strict();
export type VisitorState=z.infer<typeof visitorSchema>;
export function freshVisitor():VisitorState{return {userId:randomUUID(),conversationId:randomUUID(),messages:[],traces:[]};}
export function visitorStores(state:VisitorState):{store:AgentStore;planningStore:PlanningStore} {
  const locks=new Map<string,string>();
  const assert=(id:string,user:string,caseId?:string)=>{if(id!==state.conversationId||user!==state.userId||caseId)throw new AgentError('CONVERSATION_ACCESS_DENIED','This conversation is unavailable.');};
  const planningStore:PlanningStore={
    load:async(id,user)=>{assert(id,user);return state.plan?structuredClone(state.plan):undefined;},
    acquire:async(id,user,lease)=>{assert(id,user);if(locks.has(id))return false;locks.set(id,lease);return true;},
    release:async(id,lease)=>{if(locks.get(id)===lease)locks.delete(id);},
    save:async(plan,lease)=>{assert(plan.conversationId,plan.userId);if(locks.get(plan.conversationId)!==lease)throw new AgentError('TURN_IN_PROGRESS','Please wait for this request.');state.plan=carePlanSchema.parse(plan);return state.plan;},
    recentMessages:async(id)=>{assert(id,state.userId);return state.messages.slice(-20) as ConversationMessage[];},
  };
  const store:AgentStore={
    createConversation:async(user,caseId)=>{assert(state.conversationId,user,caseId);return state.conversationId;},
    assertConversation:async(id,user,caseId)=>assert(id,user,caseId),
    addMessage:async(id,role,content,_run,metadata)=>{assert(id,state.userId);const response=assistantResponseSchema.safeParse(metadata?.response);state.messages.push({id:randomUUID(),role,content,metadata:response.success?{response:response.data}:{},createdAt:new Date().toISOString()});state.messages=state.messages.slice(-40);},
    startRun:async(id,user,agent,caseId)=>{assert(id,user,caseId);const runId=randomUUID();state.traces.push({runId,agent,status:'running',tools:[]});state.traces=state.traces.slice(-20);return runId;},
    createTask:async()=>randomUUID(),updateTask:async()=>{},
    recordAction:async(run,_task,tool)=>{state.traces.find(t=>t.runId===run)?.tools.push(tool);return undefined;},
    saveOutput:async()=>{},finishRun:async(run,status)=>{const trace=state.traces.find(t=>t.runId===run);if(trace)trace.status=status;},
  };
  return {store,planningStore};
}
