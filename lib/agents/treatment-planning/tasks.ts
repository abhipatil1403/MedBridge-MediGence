import { randomUUID } from 'node:crypto';
import type { AgentPlan, CarePlan, CarePlanTask } from '../schemas';

export const PLANNING_LIMITS = { maxTasks: 40, maxSteps: 4, maxModelAttempts: 1, maxAgentDepth: 1 } as const;
export function derivePlanStatus(tasks: CarePlanTask[], hasFindings: boolean): CarePlan['status'] {
  const active = tasks.filter((task) => task.status !== 'cancelled');
  if (!active.length) return 'draft';
  if (active.every((task) => task.status === 'completed')) return 'completed';
  if (active.some((task) => task.status === 'in_progress' || (task.taskType === 'discovery' && task.status === 'pending'))) return 'planning';
  if (active.some((task) => task.status === 'awaiting_user' || task.status === 'blocked' || task.approvalStatus === 'pending')) return 'awaiting_user';
  if (active.some((task) => task.requiresUserAction && task.status === 'completed')) return 'in_progress';
  return hasFindings ? 'ready' : 'awaiting_user';
}

export function upsertTask(tasks: CarePlanTask[], key: string, values: Partial<CarePlanTask> & Pick<CarePlanTask, 'title' | 'taskType'>): CarePlanTask {
  let task = tasks.find((item) => item.key === key);
  if (!task) {
    if (tasks.length >= PLANNING_LIMITS.maxTasks) throw new Error('Care plan task limit reached');
    task = { id: randomUUID(), key, description: '', status: 'pending', priority: 'normal', requiresUserAction: false,
      requiresApproval: false, approvalStatus: 'not_required', findings: [], updatedAt: new Date().toISOString(), ...values };
    tasks.push(task);
  } else Object.assign(task, values, { updatedAt: new Date().toISOString() });
  return task;
}

export function discoveryTask(tasks: CarePlanTask[], step: AgentPlan['steps'][number]) {
  const task = tasks.find((item) => item.key === step.tool);
  const changed = task?.input !== step.input;
  return upsertTask(tasks, step.tool, { title: step.objective, taskType: 'discovery', tool: step.tool, input: step.input,
    ...(changed ? { status: 'pending', findings: [], runId: undefined, agentTaskId: undefined } : {}) });
}
