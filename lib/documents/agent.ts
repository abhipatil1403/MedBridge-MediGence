import type { RuntimeContext } from '@/lib/agents/runtime';
import type { DocumentAuthorization } from './service';
import type { DocumentTool } from './schemas';
import { missingRequired } from './coordination';

export function documentExecution(tool: DocumentTool, input: unknown, authorization: DocumentAuthorization): NonNullable<RuntimeContext['execution']> {
  return {
    documentAuthorization:authorization,
    plan:{agent:'document_coordination',understanding:'Organize only documents explicitly requested for your selected hospital/service.',
      steps:[{objective:tool.replaceAll('_',' '),tool,input:JSON.stringify(input)}],missingInformation:null},
    diagnostics:{workflow:'document_coordination'},
    synthesis:{summary:'Document coordination records your administrative checklist and confirmations. No document content is interpreted or shared.',nextSteps:[],question:null},
    finalize:async(response,results)=>{
      const w = results.at(-1)?.result.documents;
      if (!w) return response;
      const missing = missingRequired(w);
      const blocked=w.documents.filter(d=>d.uploadStatus==='uploaded'&&d.securityStatus&&d.securityStatus!=='clean').length;
      return {...response,documents:w,summary:blocked?`${blocked} file${blocked===1?' is':'s are'} saved privately and blocked pending successful security checks. Download and sharing are unavailable.`:!w.requirements.length?'Document requirements are not available for this hospital/service.'
        :w.package?'Ready to share. This hospital does not have a connected submission channel in MedBridge. No documents have been sent.'
          :`${missing} required document${missing===1?'':'s'} missing. Review file mappings and confirm each document before preparing the package.`,
        nextSteps:blocked?['Wait for successful security checks before reviewing or preparing these files.']:w.package?['Use the hospital’s appropriate submission channel yourself. MedBridge has not sent any files.']:['Review the requested documents and their sources.']};
    },
  };
}
