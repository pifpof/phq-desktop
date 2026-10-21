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

export const RunKindSchema = z.enum(['full', 'selected', 'playbook', 'regen'])
export type RunKind = z.infer<typeof RunKindSchema>

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
  scope: z.array(z.string()).nullable().default(null),
  /**
   * What started it (REQUIREMENTS-v4.4 3.1): everything, steps the founder chose, the Regenerate
   * playbook preset, or a page regeneration (reviewed before the wiki changes).
   */
  kind: RunKindSchema.default('full'),
  /** When "Publish the playbook" finished in this run: the done screen's trigger. */
  playbookReadyAt: z.number().nullable().default(null),
  /** When the founder saw the done screen, or the playbook it led to. */
  doneSeenAt: z.number().nullable().default(null)
})
export type RunView = z.infer<typeof RunViewSchema>

export const DEFAULT_BUDGET_USD = 5
export const DEFAULT_CONCURRENCY = 3
export const MAX_CONCURRENCY = 6

/** A research step's status from disk, across runs (REQUIREMENTS-v4.4 4A.2). */
export const StepStatusSchema = z.enum(['done', 'skipped', 'failed', 'not-run'])
export type StepStatus = z.infer<typeof StepStatusSchema>

export const StepStateSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** One plain line on what the step produces. */
  description: z.string(),
  stage: z.number().int(),
  status: StepStatusSchema,
  /** When its output was written, or when its last run skipped or failed it (ISO). */
  at: z.string().nullable(),
  /** The skip reason or failure message from its last run. */
  note: z.string().nullable(),
  /** The steps it needs, in the same list. */
  dependsOn: z.array(z.string()),
  /** Where its output opens: a wiki page or an output file. */
  open: z.string().nullable(),
  /** Done and writes wiki articles: changed only through Regenerate, on this page. */
  regenerate: z.string().nullable(),
  /** Done, but running it again only adds a new source, output version or draft. */
  rerunnable: z.boolean(),
  /** Cost of running it once with the current model. */
  costUsd: z.object({ low: z.number(), high: z.number() })
})
export type StepState = z.infer<typeof StepStateSchema>

/** A step that can be run now: its dependencies are done or skipped, or come along with it. */
export function canRun(
  step: StepState,
  byId: Map<string, StepState>,
  alongside: Set<string>
): boolean {
  if (step.status === 'done' && !step.rerunnable) return false
  return missingDeps(step, byId, alongside).length === 0
}

/** The dependencies with no output that are not coming along with this step. */
export function missingDeps(
  step: StepState,
  byId: Map<string, StepState>,
  alongside: Set<string>
): string[] {
  return step.dependsOn.filter((d) => {
    const s = byId.get(d)
    return !alongside.has(d) && s?.status !== 'done' && s?.status !== 'skipped'
  })
}

/** What the done screen shows (REQUIREMENTS-v4.4 3.3), built in main from disk with no model call. */
export const DoneStatsSchema = z.object({
  runId: z.string(),
  company: z.string(),
  version: z.number().nullable(),
  /** Sections with content in the new version. */
  sections: z.number(),
  /** Distinct raw sources behind the sections. */
  sources: z.number(),
  competitors: z.number(),
  minutes: z.number(),
  costUsd: z.number(),
  biggestGap: z.object({ step: z.string(), label: z.string(), problem: z.string() }).nullable(),
  /** Steps in this run that failed, were blocked or were skipped (not by stopping). */
  unfinished: z.array(z.object({ id: z.string(), title: z.string() })),
  messagingRunning: z.boolean()
})
export type DoneStats = z.infer<typeof DoneStatsSchema>
