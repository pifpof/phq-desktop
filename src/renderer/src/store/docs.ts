import { create } from 'zustand'
import { api, unwrap } from '@/lib/api'

interface DocsStore {
  /** Wiki-relative path of the latest playbook version in output/, or null when there is none. */
  playbookPath: string | null
  messagingPath: string | null
  loaded: boolean
  refresh(): Promise<void>
}

/** The newest version of an output kind (REQUIREMENTS-v2 4.2, 4.3). */
async function latest(kind: 'positioning-playbook' | 'messaging-analysis'): Promise<string | null> {
  const versions = await unwrap(api.listOutputs(kind)).catch(() => [])
  return versions[0]?.path ?? null
}

export const useDocs = create<DocsStore>((set) => ({
  playbookPath: null,
  messagingPath: null,
  loaded: false,
  async refresh() {
    const [playbookPath, messagingPath] = await Promise.all([
      latest('positioning-playbook'),
      latest('messaging-analysis')
    ])
    set({ playbookPath, messagingPath, loaded: true })
  }
}))
