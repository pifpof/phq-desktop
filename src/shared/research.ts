import { z } from 'zod'
import { ErrorCodeSchema } from './errors'

export const TaskStatusSchema = z.enum([
  'waiting',
  'running',
  'done',
  'failed',
  'skipped',
  'blocked'
])
export type TaskStatus = z.infer<typeof TaskStatusSchema>

export const RunStatusSchema = z.enum(['running', 'paused', 'done', 'cancelled', 'failed'])
export type RunStatus = z.infer<typeof RunStatusSchema>

/** Why a run is paused. The renderer shows a dialog for each. */
export const PauseReasonSchema = z.enum([
  'user',
  'budget',
  'invalid_key',
  'no_credit',
  'spend_limit_reached',
  'web_search_disabled'
])
export type PauseReason = z.infer<typeof PauseReasonSchema>

export const TaskViewSchema = z.object({
  id: z.string(),
  title: z.string(),
  stage: z.number().int(),
  status: TaskStatusSchema,
  /** The group task this one was created by (competitor profiles). */
  parent: z.string().nullable(),
  /** True for tasks that run on this computer and call no AI. */
  local: z.boolean(),
  web: z.boolean(),
  attempts: z.number().int(),
  startedAt: z.number().nullable(),
  endedAt: z.number().nullable(),
  costUsd: z.number(),
  error: z.object({ code: ErrorCodeSchema, message: z.string() }).nullable(),
  /** Short human note: "Waiting 12s for the rate limit", "Skipped: web search unavailable". */
  note: z.string().nullable(),
  /** Workspace-relative path of the main output, once written. */
  output: z.string().nullable()
})
export type TaskView = z.infer<typeof TaskViewSchema>

export const RunViewSchema = z.object({
  id: z.string(),
  status: RunStatusSchema,
  pause: z.object({ reason: PauseReasonSchema, message: z.string() }).nullable(),
  model: z.string(),
  concurrency: z.number().int(),
  budgetCapUsd: z.number(),
  spentUsd: z.number(),
  /** True when web tasks are being skipped (web search is unavailable or was switched off). */
  skipWeb: z.boolean(),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
  tasks: z.array(TaskViewSchema),
  /** The task IDs this run was limited to (a single re-run, or the playbook), or null for a full run. */
  scope: z.array(z.string()).nullable().default(null)
})
export type RunView = z.infer<typeof RunViewSchema>

export const DEFAULT_BUDGET_USD = 5
export const DEFAULT_CONCURRENCY = 3
export const MAX_CONCURRENCY = 6
