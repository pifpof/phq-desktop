import { create } from 'zustand'
import type { RegenJob } from '@shared/regen'
import { api, unwrap } from '@/lib/api'

/** The current regeneration, so the page it rewrites can show that it's regenerating. */
interface RegenStore {
  job: RegenJob | null
  load(): Promise<void>
}

export const useRegen = create<RegenStore>((set) => ({
  job: null,
  async load() {
    set({ job: await unwrap(api.regenJob()).catch(() => null) })
  }
}))

/** True while a regeneration that rewrites this page (or a page from the same step) runs. */
export const regenerating = (
  job: RegenJob | null,
  runActive: boolean,
  page: string,
  taskId?: string | null
): boolean =>
  runActive &&
  job?.status === 'running' &&
  (job.page === page || (!!taskId && job.taskId === taskId))
