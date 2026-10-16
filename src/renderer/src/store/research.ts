import { create } from 'zustand'
import type { Res } from '@shared/ipc-contract'
import type { RunView } from '@shared/research'
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
  dismissPause(): void
}

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

  dismissPause() {
    set({ dismissedPause: pauseKey(get().run) })
  }
}))
