import type { AgentResponse, Comparison, Finding } from '@/lib/agents/schemas';
import type { CatalogSnapshot } from '@/types/catalog';
import { RequirementEvaluator } from './RequirementEvaluator';
import { packageAttributes, type Requirement } from './RequirementTypes';

export function evaluateFindings(findings: Finding[], requirements: Requirement[], snapshot: CatalogSnapshot): Finding[] {
  const evaluated = findings.map((finding) => ({ ...finding, requirementEvaluation: RequirementEvaluator.evaluate(finding, requirements, snapshot) }));
  const rank = (item: Finding) => {
    const evaluations = item.requirementEvaluation!.evaluations.filter((e) => e.status !== 'not_applicable');
    const status = item.requirementEvaluation!.overallStatus;
    const tier = status === 'fully_satisfies' ? 0 : status === 'does_not_satisfy' ? 4 : evaluations.some((e) => e.status === 'related') ? 3 : status === 'partially_satisfies' ? 1 : 2;
    return { tier, count: evaluations.filter((e) => e.status === 'exact').length };
  };
  // Preserve entity blocks; reorder only peers before the runtime creates reference positions.
  const ordered: Finding[] = [];
  let block: Finding[] = [];
  const flush = () => { ordered.push(...block.sort((a, b) => rank(a).tier - rank(b).tier || rank(b).count - rank(a).count)); block = []; };
  for (const finding of evaluated) { if (block.length && block[0].kind !== finding.kind) flush(); block.push(finding); }
  flush(); return ordered;
}

export function evaluateComparison(comparison: Comparison, requirements: Requirement[], snapshot: CatalogSnapshot): Comparison {
  return { ...comparison, request: { ...comparison.request, requirements }, sides: comparison.sides.map((side) => ({ ...side,
    groups: side.groups.map((group) => ({ ...group, findings: evaluateFindings(group.findings, requirements.map((req) => req.type === 'location'
      ? { ...req, label: side.option.label, places: [side.option] } : req), snapshot) })),
  })) as Comparison['sides'] };
}

export function applyRequirements(response: AgentResponse, requirements: Requirement[], snapshot: CatalogSnapshot, excludedIds: string[] = []): AgentResponse {
  if (!requirements.length) return response;
  const visible = (findings: Finding[]) => evaluateFindings(findings.filter((f) => !excludedIds.includes(f.provenance.recordId)), requirements, snapshot);
  const result = { ...response, requirements, findings: visible(response.findings),
    resultGroups: response.resultGroups?.map((group) => ({ ...group, findings: visible(group.findings) })),
    comparison: response.comparison && evaluateComparison(response.comparison, requirements, snapshot) };
  // Group catalog match labels retain their original meaning and must describe the displayed records.
  if (result.resultGroups) result.resultGroups = result.resultGroups.map((group) => ({ ...group,
    matchType: group.findings.some((f) => f.matchType === 'exact') ? 'exact' : group.findings.length ? 'related' : 'none',
    matchReason: excludedIds.length && !group.findings.length ? 'No additional catalog record is available for these criteria.' : group.matchReason }));
  if (response.plan) {
    result.plan = { ...response.plan, context: { ...response.plan.context, requirements }, findings: evaluateFindings(response.plan.findings, requirements, snapshot),
      tasks: response.plan.tasks.map((task) => ({ ...task, findings: evaluateFindings(task.findings, requirements, snapshot),
        comparison: task.comparison && evaluateComparison(task.comparison, task.comparison.request.requirements ?? requirements, snapshot) })) };
  }
  const hasFeatures = requirements.some((r) => (packageAttributes as readonly string[]).includes(r.type));
  if (excludedIds.length && !result.findings.length && !result.question) result.summary = 'No additional catalog package is available for the retained requirements. I have kept your requirements; no alternative has been invented.';
  else if (hasFeatures && !result.compoundRequest && result.findings.length && !result.question && result.status !== 'failed') {
    const packages = result.findings.filter((f) => f.kind === 'packages');
    const evaluations = packages.flatMap((f) => f.requirementEvaluation!.evaluations);
    const gaps = [...new Map(evaluations.filter((e) => ['unknown', 'incomplete', 'not_met', 'related'].includes(e.status)).map((e) => [e.requirementId, e])).values()];
    result.summary = `${packages.length ? `I found ${packages.length} catalog package${packages.length === 1 ? '' : 's'}.` : 'I found catalog information.'} ${gaps.length
      ? gaps.slice(0, 4).map((e) => `${e.label}: ${e.status === 'unknown' ? 'not specified' : e.status.replaceAll('_', ' ')}. ${e.explanation}`).join(' ')
      : packages.length ? 'The applicable requirements are documented in the current catalog.' : 'Package features are not confirmed by these entity records.'} Listed sample prices are not provider quotes; catalog records do not establish medical suitability.`.slice(0, 1600);
    result.nextSteps = ['Review the package details and documented requirement evidence.', 'Unconfirmed features need provider confirmation; another matching package may not exist.'];
    result.nextActions = result.nextSteps;
  }
  return result;
}
