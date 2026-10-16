import { create } from 'zustand'
import { api, unwrap } from '@/lib/api'

interface DocsStore {
  /** Workspace-relative path of the current playbook, or null when there is none yet. */
  playbookPath: string | null
  messagingPath: string | null
  loaded: boolean
  refresh(): Promise<void>
}

/** The one markdown file at the top of a folder (versions and sections live in subfolders). */
async function topFile(dir: string): Promise<string | null> {
  const docs = await unwrap(api.listDocs(dir)).catch(() => [])
  const re = new RegExp(`^${dir}/[^/]+\\.md$`)
  return docs.filter((d) => re.test(d.path)).sort((a, b) => b.mtime - a.mtime)[0]?.path ?? null
}

export const useDocs = create<DocsStore>((set) => ({
  playbookPath: null,
  messagingPath: null,
  loaded: false,
  async refresh() {
    const [playbookPath, messagingPath] = await Promise.all([
      topFile('memory/positioning-playbook'),
      topFile('memory/messaging-analysis')
    ])
    set({ playbookPath, messagingPath, loaded: true })
  }
}))
