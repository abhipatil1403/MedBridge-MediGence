import type { CarePlanTask, Finding, PlanningResultGroup } from '../schemas';

export const planningTargets = {
  search_hospitals: 'hospitals', search_packages: 'packages', search_doctors: 'doctors', search_services: 'services',
} as const;

export function discoveryMatch(findings: Finding[], target: PlanningResultGroup['target']) {
  const exact = findings.filter((finding) => finding.matchType === 'exact').length;
  return { matchType: exact ? 'exact' as const : findings.length ? 'related' as const : 'none' as const,
    matchReason: exact ? `${exact} exact catalog ${exact === 1 ? 'record matches' : 'records match'} the saved ${target} criteria.`
      : findings.length ? `Related catalog ${target} are available; no exact matches meet the saved criteria.`
        : `No catalog ${target} match the saved criteria.` };
}

/** Each requested task owns its result state, including cached and empty searches. */
export function planningResultGroup(task: CarePlanTask): PlanningResultGroup | undefined {
  const target = planningTargets[task.tool as keyof typeof planningTargets];
  if (!target || task.taskType !== 'discovery') return undefined;
  if (task.status !== 'completed') return { taskId: task.id, target, status: 'blocked', findings: [], matchType: 'none',
    matchReason: `The ${target} search could not finish. Retry before assessing catalog matches.` };
  // Older saved plans have findings but no discovery metadata yet.
  return { taskId: task.id, target, status: 'completed', findings: task.findings,
    ...task.discovery ?? discoveryMatch(task.findings, target) };
}

export function resultGroupLabel(group: Pick<PlanningResultGroup, 'matchType' | 'status'>) {
  return group.status === 'blocked' ? 'Search incomplete' : group.matchType === 'exact' ? 'Exact catalog matches'
    : group.matchType === 'related' ? 'Related catalog information' : 'No catalog matches';
}
