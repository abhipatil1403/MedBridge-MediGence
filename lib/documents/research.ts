import { randomUUID } from 'node:crypto';
import { approvedSources, evidenceId, retrieveOfficialPage, textFromHtml, type ResearchRetriever } from '@/lib/research/sources';
import { safeText } from '@/lib/agents/execution-state';
import { documentRequirementSchema, type DocumentRequirement } from './schemas';

/** Reuse the research agent's bounded approved-source transport; never read uploads. */
export async function researchDocumentRequirements(hospitalId:string,hospitalName:string,serviceLabel:string,retrieve:ResearchRetriever=retrieveOfficialPage):Promise<DocumentRequirement[]> {
  const sources = approvedSources.filter(s=>s.provider===hospitalName && s.treatments.includes(serviceLabel.toLowerCase().replaceAll('-',' '))).slice(0,2);
  const result:DocumentRequirement[]=[];
  for (const source of sources) {
    try {
      const page=await retrieve(source);
      if(page.url!==source.url) continue;
      const lines=textFromHtml(page.html).split('\n');
      if(!lines.some(l=>l.includes(source.provider)||source.aliases.some(a=>l.includes(a)))) continue;
      // Only direct administrative "required documents: ..." statements. No medical content inference.
      for(const line of lines) {
        const match=/^(?:required documents|documents required|documents to bring)\s*:\s*([^.!?]+)[.!]?$/i.exec(line);
        if(!match||safeText(line)!==line||/https?:|ignore|instruction|diagnos|recommend|interpret|severity|treatment needed/i.test(line)) continue;
        for(const label of match[1].split(/;|,/).map(s=>s.trim()).filter(Boolean)) {
          if(label.length>180||!/(?:report|prescription|summary|document|identification|passport|referral)/i.test(label)) continue;
          result.push(documentRequirementSchema.parse({id:randomUUID(),label,description:line.slice(0,400),required:true,status:'required',hospitalId,serviceLabel,
            source:{kind:'external',id:evidenceId(page.url),label:'Official hospital page · externally sourced',reference:page.url,retrievedAt:page.retrievedAt}}));
        }
      }
    }catch { /* Unavailable/unsupported evidence stays unavailable. */ }
  }
  return result.slice(0,30);
}
