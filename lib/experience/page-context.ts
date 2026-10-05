import 'server-only';
import { z } from 'zod';
import { getPublicSupabaseClient } from '@/lib/supabase/server';
import type { OrchestratorContext } from '@/lib/agents/orchestrator';
import { runAgent } from '@/lib/agents/runtime';
import type { ToolName } from '@/lib/agents/schemas';
import { AgentError } from '@/lib/agents/errors';
export const pageContextSchema=z.object({kind:z.enum(['hospital','doctor','package']),slug:z.string().regex(/^[a-z0-9-]{2,100}$/)}).strict();
export async function seedPageContext(page:z.infer<typeof pageContextSchema>,conversationId:string,context:OrchestratorContext) {
  const table=page.kind==='hospital'?'hospitals':page.kind==='doctor'?'doctors':'packages';
  const result=await getPublicSupabaseClient().from(table).select('name,slug').eq('slug',page.slug).maybeSingle();
  if(result.error||!result.data)throw new AgentError('PUBLIC_CONTEXT_UNAVAILABLE','The public provider context is unavailable.');
  const recent=await context.planningStore.recentMessages(conversationId);
  const marker=`Page context: ${result.data.name}`;
  const previous=[...recent].reverse().find(message=>message.role==='user'&&message.content.startsWith('Page context: '));
  if(previous?.content===marker)return;
  return runAgent({content:marker,conversationId}, {...context,execution:{
    plan:{agent:'discovery',understanding:'Read the published record on the current page.',steps:[{objective:'Read published page context',tool:`get_${page.kind}_details` as ToolName,input:JSON.stringify({slug:result.data.slug})}],missingInformation:null},
    allowModelFollowUps:false,diagnostics:{workflow:'page_context'},
    synthesis:{summary:'Published information from your current page is available as conversation context. Missing information still requires confirmation with the provider.',nextSteps:[],question:null},
  }});
}
