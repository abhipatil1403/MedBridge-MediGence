import type { CatalogSnapshot } from '@/types/catalog';
import type { RuntimeContext } from '@/lib/agents/runtime';
import type { CarePlan, AgentPlan } from '@/lib/agents/schemas';
import type { ConversationMessage } from '@/lib/conversation/context';
import type { PlanningStore } from '@/lib/agents/treatment-planning/store';
import { prepareReferenceExecution } from '@/lib/conversation/execution';
import { assistanceHref } from './links';

/** Read the selected public record, then hand off to the existing consented form. */
export async function prepareInquiry(input:{content:string;conversationId:string;recent:ConversationMessage[];active?:CarePlan;
  snapshot:CatalogSnapshot;store:PlanningStore;lease:string}):Promise<NonNullable<RuntimeContext['execution']>> {
  const kinds=['hospitals','doctors','packages'] as const;
  const named=kinds.flatMap(kind=>input.snapshot[kind].filter(r=>input.content.toLowerCase().includes(r.name.toLowerCase())).map(record=>({kind,record})));
  let execution:NonNullable<RuntimeContext['execution']>|undefined;
  if(named.length===1){
    const selected=named[0], tool=selected.kind==='hospitals'?'get_hospital_details':selected.kind==='doctors'?'get_doctor_details':'get_package_details';
    const args={slug:selected.record.slug};
    const plan:AgentPlan={agent:'treatment_planning',understanding:'Review your selected published listing before requesting assistance.',
      steps:[{tool,input:JSON.stringify(args),objective:'Read the current selected listing'}],missingInformation:null};
    execution={plan,referenceBoundary:{status:'resolved',allowedCalls:[{tool,input:args}]},synthesis:{summary:'Review the selected listing before preparing your request.',nextSteps:[],question:null}};
  }else if(!named.length)execution=await prepareReferenceExecution({...input,content:`Tell me more about ${input.content}`});
  if(!execution)execution={plan:{agent:'treatment_planning',understanding:'Choose the listing for your inquiry.',steps:[],missingInformation:'Which published hospital, doctor or package should this inquiry concern?'},
    synthesis:{summary:'Choose one real published listing before preparing an inquiry.',question:'Which published hospital, doctor or package should this inquiry concern?',nextSteps:['Choose Request assistance from a published listing.']}};
  const finalize=execution.finalize;
  return {...execution,allowModelFollowUps:false,diagnostics:{...execution.diagnostics,workflow:'reference_inquiry_preparation'},finalize:async(response,results)=>{
    const reviewed=finalize?await finalize(response,results):response;
    const targets=reviewed.findings.filter(f=>kinds.includes(f.kind as typeof kinds[number]));
    if(targets.length!==1 || reviewed.status==='failed')return reviewed;
    const target=targets[0];
    if(target.provenance.sourceKind==='synthetic')return {...reviewed,status:'awaiting_user_input',summary:'Synthetic listings cannot receive an inquiry. Choose a real published listing.',question:'Which real published listing should this inquiry concern?'};
    const kind=target.kind==='hospitals'?'hospital':target.kind==='doctors'?'doctor':'package';
    return {...reviewed,status:'awaiting_user_input',summary:'Your selected listing was read. Review your question and authorize MedBridge Support in the request form. No inquiry has been submitted; documents and provider access require separate permission.',
      question:null,nextSteps:['Review the selected listing and prepare your inquiry.'],inquiryPreparation:{state:'review_required',name:target.title,
        href:assistanceHref(kind,target.provenance.recordId,'ai_finding',response.conversationId)}};
  }};
}
