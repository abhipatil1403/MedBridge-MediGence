import type { OperationType, PlannedOperation } from './CompoundRequest';

/** Topological order, irrespective of the order of action clauses in prose. */
export function planOperations(requested: OperationType[]): PlannedOperation[] {
  const operations: PlannedOperation[] = [];
  const add = (type: OperationType, dependsOn: OperationType[] = [], scope: PlannedOperation['scope'] = 'independent') =>
    operations.push({ id: type, type, dependsOn, scope, status: 'pending' });
  if (requested.includes('discover_hospitals')) add('discover_hospitals');
  if (requested.includes('discover_doctors')) add('discover_doctors');
  if (requested.includes('discover_packages')) add('discover_packages', requested.includes('discover_hospitals') ? ['discover_hospitals'] : [],
    requested.includes('discover_hospitals') ? 'linked_hospitals' : 'independent');
  const retrievals = operations.map((op) => op.id);
  // Evaluation is implicit for every retrieval; explicit gap requests and comparison also record it in the graph.
  if (requested.includes('evaluate_requirements') || requested.includes('compare_results')) add('evaluate_requirements', retrievals, 'candidates');
  if (requested.includes('compare_results')) add('compare_results', ['evaluate_requirements'], 'candidates');
  return operations;
}
