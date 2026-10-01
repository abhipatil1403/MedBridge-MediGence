import type { CatalogSnapshot } from '@/types/catalog';
import { QueryNormalizer } from '@/lib/discovery/query-normalizer';
import { normalize } from '@/lib/discovery/normalize';
import { planningContextSchema, type CarePlan, type PlanningContext } from '../schemas';
import { RequirementExtractor } from '@/lib/requirements/RequirementExtractor';
import { legacyBudget } from '@/lib/requirements/RequirementNormalizer';

export function resolvePlanningContext(content: string, snapshot: CatalogSnapshot, active?: CarePlan, caseContext?: Record<string, unknown>): PlanningContext {
  // Later sentences express actions/preferences, not part of the procedure's name.
  const goalText = content.split(/[.!?]/)[0].replace(/,?\s+(?:under|below|within|less than|maximum|(?:my )?budget|with|and I want)\b.*$/i, '').replace(/\s+treatment(?=\s+(?:in|at|near)\b|$)/i, '');
  const normalized = QueryNormalizer.normalize(goalText, snapshot);
  const entities = normalized.entities;
  const treatment = snapshot.treatments.find((item) => item.slug === entities.procedure);
  const caseTreatment = snapshot.treatments.find((item) => item.recordId === caseContext?.preferredTreatmentId);
  const caseCountry = snapshot.countries.find((item) => item.recordId === caseContext?.preferredCountryId);
  const previous = active?.context ?? (caseContext ? {
    goalType: 'treatment' as const, requestedTargets: [], treatmentSlug: caseTreatment?.slug, treatmentName: caseTreatment?.name,
    treatmentId: caseTreatment?.recordId, specialty: caseTreatment?.specialty, country: caseCountry?.slug,
    city: typeof caseContext.preferredCity === 'string' ? caseContext.preferredCity : undefined,
  } : undefined);
  const consultation = /\bconsultation\b/i.test(content);
  const newConsultationGoal = consultation && !treatment && entities.specialty && entities.specialty !== previous?.specialty;
  const explicitTargets: PlanningContext['requestedTargets'] = [];
  const requirements = RequirementExtractor.extract(content, snapshot, previous?.requirements);
  if (/\bhospitals?\b/i.test(content)) explicitTargets.push('hospitals');
  if (/\bpackages?\b/i.test(content)) explicitTargets.push('packages');
  if (requirements.some((item) => item.type === 'package' && item.originalExpression === content) && !explicitTargets.includes('packages')) explicitTargets.push('packages');
  if (/\b(doctors?|cardiologists?|specialists?|clinicians?)\b/i.test(content)) explicitTargets.push('doctors');
  if (consultation && !treatment) explicitTargets.push('doctors', 'services');
  const requestedTargets = [...new Set(explicitTargets.length ? explicitTargets : previous?.requestedTargets.length ? previous.requestedTargets : ['hospitals', 'packages'] as const)];
  const budget = requirements.some((r) => r.type === 'budget') ? legacyBudget(requirements)
    : /\b(no|remove|drop)\s+(?:the\s+)?budget\b/i.test(content) ? undefined : previous?.budget;
  const hospital = snapshot.hospitals.find((item) => /\bprefer\b/i.test(content) && normalize(content).includes(normalize(item.name)));
  return planningContextSchema.parse({ ...previous, goalType: consultation ? 'consultation' : treatment ? 'treatment' : previous?.goalType ?? 'treatment',
    treatmentSlug: treatment?.slug ?? (newConsultationGoal ? undefined : previous?.treatmentSlug), treatmentName: treatment?.name ?? (newConsultationGoal ? undefined : previous?.treatmentName),
    treatmentId: treatment?.recordId ?? (newConsultationGoal ? undefined : previous?.treatmentId),
    specialty: entities.specialty ?? previous?.specialty, city: entities.city ?? (entities.country ? undefined : previous?.city), country: entities.country ?? previous?.country,
    budget, requirements, requestedTargets, preferredHospital: hospital?.slug ?? previous?.preferredHospital,
    consultationMode: /\b(video|online)\b/i.test(content) ? 'video' : /\bin.person\b/i.test(content) ? 'in-person' : previous?.consultationMode,
  });
}

export function planningQuestion(context: PlanningContext): string | null {
  const specialtyScope = context.specialty && (context.goalType === 'consultation' || context.requestedTargets.length === 1 && context.requestedTargets[0] === 'packages');
  if (!context.treatmentSlug && !specialtyScope)
    return context.goalType === 'consultation' ? 'Which specialty are you looking for a consultation with?' : 'What treatment or procedure are you planning for?';
  if (!context.city && !context.country) return 'Which city or country would you prefer?';
  return null;
}
