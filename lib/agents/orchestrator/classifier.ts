import { z } from 'zod';
import type { NormalizedDiscoveryQuery } from '@/lib/discovery/query-normalizer';
import type { CarePlan } from '../schemas';

export const workflowDecisionSchema = z.object({ workflow: z.enum(['discovery', 'treatment_planning']),
  reason: z.enum(['catalog_request', 'planning_goal', 'plan_continuation', 'missing_context']) }).strict();
export type WorkflowDecision = z.infer<typeof workflowDecisionSchema>;

export function classifyWorkflow(content: string, normalized: NormalizedDiscoveryQuery, active?: CarePlan): WorkflowDecision {
  const wantsPlan = /\b(plan|planning|help me (?:understand|organize)|i need|i want|i am looking for)\b/i.test(content);
  const careGoal = Boolean(normalized.entities.procedure || normalized.entities.procedurePhrase || /\b(treatment|surgery|consultation)\b/i.test(content));
  const simpleDoctor = normalized.targets.length === 1 && normalized.targets[0] === 'doctors' && !normalized.entities.procedure && !/\b(plan|consultation)\b/i.test(content);
  if (simpleDoctor && normalized.entities.specialty && active?.context.specialty !== normalized.entities.specialty)
    return workflowDecisionSchema.parse({ workflow: 'discovery', reason: 'catalog_request' });
  const followUp = /\b(show|packages?|hospitals?|doctors?|options?|cheapest|compare|budget|prefer|reviewed|confirm|continue|cancel|consultation|done|complete|those|these)\b/i.test(content);
  if (active && (followUp || (active.status === 'awaiting_user' && (normalized.entities.procedure || normalized.entities.city || normalized.entities.specialty))) && !(/\b(?:new|separate) (?:plan|goal)\b/i.test(content))) {
    // An explicit different procedure is a new goal within the current conversation.
    if (!normalized.entities.procedure || !active.context.treatmentSlug || normalized.entities.procedure === active.context.treatmentSlug)
      return workflowDecisionSchema.parse({ workflow: 'treatment_planning', reason: 'plan_continuation' });
  }
  if (wantsPlan && careGoal && !simpleDoctor) return workflowDecisionSchema.parse({ workflow: 'treatment_planning', reason: 'planning_goal' });
  if (!active && normalized.targets.includes('packages') && !normalized.entities.procedure)
    return workflowDecisionSchema.parse({ workflow: 'discovery', reason: 'missing_context' });
  return workflowDecisionSchema.parse({ workflow: 'discovery', reason: 'catalog_request' });
}
