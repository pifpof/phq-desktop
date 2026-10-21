import { create } from 'zustand'
import type { Res } from '@shared/ipc-contract'
import type { RunView, StepState } from '@shared/research'
import { api, unwrap } from '@/lib/api'

export type Estimate = Res<'research:estimate'>

interface ResearchStore {
  run: RunView | null
  loaded: boolean
  estimate: Estimate | null
  estimateError: string | null
  /** The pause the person closed, so its dialog does not come back for the same pause. */
  dismissedPause: string | null
  load(): Promise<void>
  /** Keeps `run` current from main-process events. Returns the unsubscribe function. */
  subscribe(): () => void
  loadEstimate(): Promise<void>
  start(options: { budgetCapUsd?: number; concurrency?: number }): Promise<void>
  pause(): Promise<void>
  resume(options?: { skipWeb?: boolean; budgetCapUsd?: number }): Promise<void>
  cancel(): Promise<void>
  retry(taskId: string): Promise<void>
  /** A new run of just these tasks, or the playbook preset. */
  rerun(target: { taskIds?: string[]; preset?: 'playbook' }): Promise<void>
  dismissPause(): void
  /** Each step's status from disk (REQUIREMENTS-v4.4 4A). */
  steps: StepState[] | null
  stepsError: string | null
  loadSteps(): Promise<void>
  /** Runs these steps: a new run, or added to the one that is going. */
  runTasks(taskIds: string[], budgetCapUsd?: number): Promise<void>
  /** The run whose done screen is showing on the Research page (REQUIREMENTS-v4.4 3.3). */
  doneShown: string | null
  showDone(runId: string): void
  /** Leaves the done screen and records that it was seen. */
  closeDone(): void
  /** The founder has steps ticked on the Research page: not safe to navigate. */
  ticking: boolean
  setTicking(ticking: boolean): void
}

/** Records that the done screen (or the playbook it led to) was seen. */
export async function markSeen(runId: string): Promise<void> {
  await unwrap(api.markDoneSeen(runId)).catch(() => undefined)
}

/** A run whose playbook is ready and whose done screen the founder hasn't seen (REQUIREMENTS-v4.4 3.1). */
export const doneScreenFor = (run: RunView | null): string | null =>
  run?.playbookReadyAt && !run.doneSeenAt && (run.kind === 'full' || run.kind === 'selected')
    ? run.id
    : null

/** Identifies one pause, so a closed dialog stays closed until something changes. */
export const pauseKey = (run: RunView | null): string | null =>
  run?.status === 'paused' && run.pause
    ? `${run.id}:${run.pause.reason}:${run.spentUsd.toFixed(4)}`
    : null

export const useResearch = create<ResearchStore>((set, get) => ({
  run: null,
  loaded: false,
  estimate: null,
  estimateError: null,
  dismissedPause: null,

  async load() {
    const run = await unwrap(api.getResearchRun()).catch(() => null)
    set({ run, loaded: true })
  },

  subscribe() {
    return api.onResearchEvent((run) => set({ run, loaded: true }))
  },

  async loadEstimate() {
    set({ estimate: null, estimateError: null })
    try {
      set({ estimate: await unwrap(api.estimateResearch()) })
    } catch (err) {
      set({ estimateError: err instanceof Error ? err.message : 'Could not estimate the cost.' })
    }
  },

  async start(options) {
    const run = await unwrap(api.startResearch(options))
    set({ run, dismissedPause: null })
  },

  async pause() {
    await unwrap(api.pauseResearch())
  },

  async resume(options) {
    await unwrap(api.resumeResearch(options ?? {}))
    set({ dismissedPause: null })
  },

  async cancel() {
    await unwrap(api.cancelResearch())
  },

  async retry(taskId) {
    await unwrap(api.retryResearchTask(taskId))
  },

  async rerun(target) {
    const run = await unwrap(api.rerunResearch(target))
    set({ run, dismissedPause: null })
  },

  dismissPause() {
    set({ dismissedPause: pauseKey(get().run) })
  },

  steps: null,
  stepsError: null,
  async loadSteps() {
    try {
      set({ steps: await unwrap(api.researchTaskStates()), stepsError: null })
    } catch (err) {
      set({ stepsError: err instanceof Error ? err.message : 'Could not read the research steps.' })
    }
  },

  doneShown: null,
  showDone(runId) {
    set({ doneShown: runId })
  },
  closeDone() {
    const id = get().doneShown
    set({ doneShown: null })
    if (id) void markSeen(id)
  },
  ticking: false,
  setTicking(ticking) {
    if (get().ticking !== ticking) set({ ticking })
  },

  async runTasks(taskIds, budgetCapUsd) {
    const run = await unwrap(api.runResearchTasks({ taskIds, budgetCapUsd }))
    set({ run, dismissedPause: null })
  }
}))
