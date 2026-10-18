import { create } from 'zustand'
import type { Change } from '@shared/changes'
import { api, unwrap } from '@/lib/api'

/** Every change in the wiki (REQUIREMENTS-v3.1 3), refreshed whenever the wiki changes. */
interface ChangesStore {
  changes: Change[]
  load(): Promise<void>
}

export const useChanges = create<ChangesStore>((set) => ({
  changes: [],
  async load() {
    const changes = await unwrap(api.listChanges()).catch(() => null)
    if (changes) set({ changes })
  }
}))

export const waitingFor = (changes: Change[], page: string): Change[] =>
  changes.filter((c) => c.status === 'pending' && c.page === page)

export const waitingCount = (changes: Change[]): number =>
  changes.filter((c) => c.status === 'pending').length
