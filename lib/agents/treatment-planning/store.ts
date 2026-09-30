import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database';
import { AgentError } from '../errors';
import { carePlanSchema, type CarePlan } from '../schemas';

export interface PlanningStore {
  load(conversationId: string, userId: string): Promise<CarePlan | undefined>;
  save(plan: CarePlan, lease: string): Promise<CarePlan>;
  acquire(conversationId: string, userId: string, lease: string): Promise<boolean>;
  release(conversationId: string, lease: string): Promise<void>;
  recentMessages(conversationId: string): Promise<Array<{ role: string; content: string }>>;
}

export class SupabasePlanningStore implements PlanningStore {
  constructor(private readonly admin: SupabaseClient<Database>, private readonly userDb: SupabaseClient<Database>) {}
  async load(conversationId: string, userId: string) {
    const { data, error } = await this.userDb.from('care_plans').select('*').eq('conversation_id', conversationId).eq('user_id', userId).maybeSingle();
    // Keep the existing discovery workspace readable while its new migration is pending.
    if (error && ['PGRST205', '42P01'].includes(error.code)) return undefined;
    if (error) throw new AgentError('PLANNING_DATABASE_FAILURE', 'Care planning is unavailable. Please check that the care-plan migration has been applied.');
    if (!data) return undefined;
    const tasks = await this.userDb.from('care_plan_tasks').select('*').eq('care_plan_id', data.id).order('created_at').order('id');
    if (tasks.error) throw new AgentError('DATABASE_FAILURE', 'The saved plan could not be loaded.');
    return carePlanSchema.parse({ id: data.id, userId: data.user_id, conversationId: data.conversation_id,
      title: data.title, goal: data.goal, status: data.status, context: data.context, findings: data.findings,
      createdAt: new Date(data.created_at).toISOString(), updatedAt: new Date(data.updated_at).toISOString(),
      tasks: (tasks.data ?? []).map((task) => ({ ...(task.metadata as Record<string, Json>),
        id: task.id, key: task.task_key, title: task.title, description: task.description, taskType: task.task_type,
        status: task.status, priority: task.priority, requiresUserAction: task.requires_user_action,
        requiresApproval: task.requires_approval, approvalStatus: task.approval_status, updatedAt: new Date(task.updated_at).toISOString() })),
    });
  }
  async save(plan: CarePlan, lease: string) {
    const validated = carePlanSchema.parse(plan);
    const result = await this.admin.rpc('save_care_plan', { p_plan: JSON.parse(JSON.stringify(validated)) as Json, p_token: lease });
    if (result.error) throw new AgentError('DATABASE_FAILURE', 'The care plan could not be saved. Please try again.');
    return validated;
  }
  async acquire(conversationId: string, userId: string, lease: string) {
    const result = await this.admin.rpc('acquire_assistant_turn', { p_conversation_id: conversationId, p_user_id: userId, p_token: lease });
    if (result.error) throw new AgentError(['PGRST202', '42883'].includes(result.error.code) ? 'PLANNING_MIGRATION_MISSING' : 'PLANNING_DATABASE_FAILURE', 'Care planning needs its database migration before it can run.');
    return result.data;
  }
  async release(conversationId: string, lease: string) {
    const result = await this.admin.rpc('release_assistant_turn', { p_conversation_id: conversationId, p_token: lease });
    if (result.error) console.error(JSON.stringify({ event: 'assistant_lease_release_failed', conversationId }));
  }
  async recentMessages(conversationId: string) {
    const result = await this.userDb.from('conversation_messages').select('role,content').eq('conversation_id', conversationId)
      .order('created_at', { ascending: false }).limit(8);
    if (result.error) throw new AgentError('DATABASE_FAILURE', 'Conversation context could not be loaded.');
    return (result.data ?? []).reverse();
  }
}
