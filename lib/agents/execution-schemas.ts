import { z } from 'zod';

export const runStateSchema = z.enum(['queued', 'planning', 'executing', 'observing', 'waiting_for_input', 'awaiting_confirmation', 'completed', 'partially_completed', 'failed', 'cancelled']);
export type RunState = z.infer<typeof runStateSchema>;
export const activitySchema = z.object({
  runId: z.uuid(), state: runStateSchema, updatedAt: z.iso.datetime(),
  steps: z.array(z.object({ id: z.uuid(), number: z.number().int().positive(), label: z.string().max(160),
    status: z.enum(['running', 'completed', 'failed', 'reused']), recordCount: z.number().int().nonnegative(),
    error: z.string().max(120).optional() }).strict()).max(16),
  warnings: z.array(z.string().max(300)).max(8),
}).strict();
export type RunActivity = z.infer<typeof activitySchema>;

// Deliberately accept untrusted tool names here, so rejected proposals become
// observations rather than escaping validation before the execution boundary.
export const decisionSchema = z.object({
  action: z.enum(['call_tool', 'continue', 'clarify', 'finish', 'partial']),
  tool: z.string().max(80).nullable(), version: z.string().max(12).nullable(),
  input: z.string().max(1000).nullable(), question: z.string().min(3).max(300).nullable(),
}).strict().superRefine((d, ctx) => {
  if (d.action === 'call_tool' && (!d.tool || !d.input)) ctx.addIssue({ code: 'custom', message: 'A tool and JSON arguments are required' });
  if (d.action === 'clarify' && !d.question) ctx.addIssue({ code: 'custom', message: 'A clarification question is required' });
});
export type AgentDecision = z.infer<typeof decisionSchema>;
