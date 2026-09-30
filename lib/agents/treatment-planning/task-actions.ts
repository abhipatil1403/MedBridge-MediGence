import { z } from 'zod';
import { AgentError } from '../errors';
import { derivePlanStatus } from './tasks';
import type { PlanningStore } from './store';

export const taskActionSchema = z.object({ conversationId: z.uuid(), planId: z.uuid(), taskId: z.uuid(),
  action: z.enum(['complete', 'reopen']), caseId: z.uuid().optional() }).strict();
export async function updatePlanningTask(input: z.infer<typeof taskActionSchema>, userId: string, store: PlanningStore, lease: string) {
  const plan = await store.load(input.conversationId, userId);
  if (!plan || plan.id !== input.planId) throw new AgentError('PLAN_ACCESS_DENIED', 'This plan is unavailable.');
  if (plan.status === 'cancelled') throw new AgentError('TASK_ACTION_DENIED', 'This plan is cancelled.');
  const task = plan.tasks.find((item) => item.id === input.taskId);
  if (!task || !['review', 'preferences'].includes(task.taskType) || !task.requiresUserAction || task.requiresApproval
    || task.status === 'cancelled' || task.status === 'blocked') throw new AgentError('TASK_ACTION_DENIED', 'This task cannot be confirmed from the planning panel.');
  task.status = input.action === 'complete' ? 'completed' : 'pending';
  task.updatedAt = new Date().toISOString();
  plan.status = derivePlanStatus(plan.tasks, plan.findings.length > 0);
  plan.updatedAt = new Date().toISOString();
  return store.save(plan, lease);
}
