import { z } from 'zod';
export const coordinationSchema=z.object({
  scope:z.literal('owner_non_clinical_coordination'),
  journeys:z.array(z.object({id:z.uuid(),title:z.string(),stage:z.string(),hospital_id:z.uuid().nullable()})).max(20),
  tasks:z.array(z.object({id:z.uuid(),journey_id:z.uuid(),title:z.string(),status:z.enum(['open','completed']),due_at:z.string().nullable(),source:z.literal('user_created'),completed_at:z.string().nullable()})).max(50),
  events:z.array(z.object({journey_id:z.uuid(),title:z.string(),event_type:z.string(),occurred_at:z.string()})).max(20),
  savedProviders:z.array(z.object({kind:z.string(),hospital_id:z.uuid().nullable(),doctor_id:z.uuid().nullable(),name:z.string().optional(),href:z.string().regex(/^\/(?:hospitals|doctors)\/[a-z0-9-]+$/).optional()})).max(50),
  documents:z.array(z.object({id:z.uuid(),title:z.string(),document_type:z.string()})).max(50),boundary:z.string(),
}).strict();
export type CoordinationContext=z.infer<typeof coordinationSchema>;
