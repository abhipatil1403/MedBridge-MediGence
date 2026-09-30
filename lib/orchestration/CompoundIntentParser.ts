import type { Requirement } from '@/lib/requirements/RequirementTypes';
import { compoundRequestSchema, type CompoundRequest, type OperationType } from './CompoundRequest';
import { planOperations } from './OperationPlanner';
import { needsLinkedPackages } from '@/lib/agents/HospitalMatchingAgent';

/** Requirements are supplied by the existing extractor. This parser detects actions only. */
export function parseCompoundIntent(content: string, requirements: Requirement[], previous?: CompoundRequest): CompoundRequest | undefined {
  if (previous && /^\s*what about\b/i.test(content) && requirements.some((r) => r.type === 'location' && r.originalExpression === content))
    return compoundRequestSchema.parse({ ...previous, requirements, operations: previous.operations.map((op) => ({ ...op, status: 'pending', note: undefined })) });
  const requested: OperationType[] = [];
  const action = '(?:find|search|show|list|check|retrieve|look for)';
  const beforeTarget = '(?:(?!\\b(?:hospitals?|doctors?|specialists?|packages?)\\b)[^.!?;]){0,160}?';
  if (new RegExp(`\\b${action}\\b${beforeTarget}\\bhospitals?\\b`, 'i').test(content)) requested.push('discover_hospitals');
  if (new RegExp(`\\b${action}\\b${beforeTarget}\\b(?:doctors?|specialists?)\\b`, 'i').test(content)) requested.push('discover_doctors');
  if (new RegExp(`\\b${action}\\b${beforeTarget}\\bpackages?\\b`, 'i').test(content)) requested.push('discover_packages');
  if (/\b(?:what(?:'s| is) missing|missing (?:requirements|criteria)|evaluate requirements|check requirements)\b/i.test(content)) requested.push('evaluate_requirements');
  if (/\b(?:compare|comparison|versus|vs)\b/i.test(content)) requested.push('compare_results');
  const retrievals = requested.filter((type) => type.startsWith('discover_'));
  if (!retrievals.length || requested.length < 2) return undefined;
  // A shared noun list remains the existing planning/discovery workflow. Multiple action clauses are compound.
  const actions = content.match(/\b(?:find|search|show|list|check|retrieve|look for|compare|comparison|tell me)\b/gi) ?? [];
  if (actions.length < 2) return undefined;
  const procedure = requirements.find((r) => r.type === 'procedure');
  const specialty = requirements.find((r) => r.type === 'specialty');
  const places = requirements.find((r) => r.type === 'location')?.places ?? [];
  const clarification = !procedure && !specialty ? { field: 'procedure' as const, question: 'What treatment or specialty are you looking for?' }
    : places.length > 2 && requested.includes('compare_results') ? { field: 'location' as const, question: 'Which two cities or countries would you like to compare?' } : undefined;
  return compoundRequestSchema.parse({ requirements, operations: planOperations(requested), requiresClarification: Boolean(clarification), clarification });
}

/** A hospital search uses the same operation graph even when it has only one explicit action. */
export function parseHospitalMatchingIntent(content: string, requirements: Requirement[], previous?: CompoundRequest): CompoundRequest | undefined {
  if (/\bdoctors?|specialists?\b|\bhospitals?\s*(?:and|,)\s*packages?\b/i.test(content)) return undefined;
  const continuing = previous?.operations.some((op) => op.type === 'discover_hospitals')
    && /^\s*(?:what about|compare (?!it\b))\b/i.test(content)
    && requirements.some((r) => r.type === 'location' && r.originalExpression === content);
  if (!continuing && !/\b(?:find|search|show|list|look for)\b(?:(?!\b(?:packages?|doctors?)\b)[^.!?;]){0,160}?\bhospitals?\b/i.test(content)) return undefined;
  const requested: OperationType[] = continuing ? previous!.operations.map((op) => op.type) : ['discover_hospitals', 'evaluate_requirements'];
  if (/\bcost|\bprice|\bduration\b/i.test(content) && !requested.includes('discover_packages')) requested.push('discover_packages');
  if (needsLinkedPackages({ requirements, requestedOperations: requested }) && !requested.includes('discover_packages')) requested.push('discover_packages');
  if (/\bcompare\b/i.test(content) && !requested.includes('compare_results')) requested.push('compare_results');
  const procedure = requirements.find((r) => r.type === 'procedure');
  const specialty = requirements.find((r) => r.type === 'specialty');
  if (!continuing && (!procedure && !specialty || procedure && procedure.matchType !== 'exact')) return undefined;
  const places = requirements.find((r) => r.type === 'location')?.places ?? [];
  const clarification = !procedure && !specialty ? { field: 'procedure' as const, question: 'What treatment or specialty are you looking for?' }
    : places.length > 2 && requested.includes('compare_results') ? { field: 'location' as const, question: 'Which two cities or countries would you like to compare?' } : undefined;
  return compoundRequestSchema.parse({ requirements, operations: planOperations(requested), requiresClarification: Boolean(clarification), clarification });
}
