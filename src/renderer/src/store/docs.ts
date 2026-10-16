import { create } from 'zustand'
import { api, unwrap } from '@/lib/api'

interface DocsStore {
  /** Workspace-relative path of the current playbook, or null when there is none yet. */
  playbookPath: string | null
  loaded: boolean
  refresh(): Promise<void>
}

/** The current playbook is the one markdown file at the top of memory/positioning-playbook (versions and sections live in folders). */
export const useDocs = create<DocsStore>((set) => ({
  playbookPath: null,
  loaded: false,
  async refresh() {
    const docs = await unwrap(api.listDocs('memory/positioning-playbook')).catch(() => [])
    const top = docs.filter((d) => /^memory\/positioning-playbook\/[^/]+\.md$/.test(d.path))
    set({ playbookPath: top.sort((a, b) => b.mtime - a.mtime)[0]?.path ?? null, loaded: true })
  }
}))
