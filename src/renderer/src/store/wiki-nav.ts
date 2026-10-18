import { create } from 'zustand'
import type { NavState, SourcesTree, WikiTree } from '@shared/wiki-tree'
import { api, unwrap } from '@/lib/api'
import { isExpanded, startsCollapsed } from '@/features/wiki/tree-rows'

/**
 * The Wiki pane's trees and what is expanded (REQUIREMENTS-v3 3.3). Section headings start
 * collapsed and are listed in `open` once expanded; parents start expanded and are listed in
 * `collapsed` once collapsed. Saved per workspace in app state.
 */

interface WikiNavStore {
  articles: WikiTree | null
  sources: SourcesTree | null
  loaded: boolean
  collapsed: Set<string>
  open: Set<string>
  load(): Promise<void>
  reloadTrees(): Promise<void>
  isExpanded(key: string): boolean
  setManyExpanded(keys: string[], expanded: boolean): void
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
const save = (state: NavState): void => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void api.setNavState(state), 300)
}

export const useWikiNav = create<WikiNavStore>((set, get) => ({
  articles: null,
  sources: null,
  loaded: false,
  collapsed: new Set(),
  open: new Set(),
  async load() {
    const nav = await unwrap(api.getNavState()).catch(() => ({ collapsed: [], open: [] }))
    set({ collapsed: new Set(nav.collapsed), open: new Set(nav.open) })
    await get().reloadTrees()
  },
  async reloadTrees() {
    const [articles, sources] = await Promise.all([
      unwrap(api.wikiTree()).catch(() => null),
      unwrap(api.sourcesTree()).catch(() => null)
    ])
    set({ articles, sources, loaded: true })
  },
  isExpanded: (key) => isExpanded(key, get().collapsed, get().open),
  setManyExpanded(keys, expanded) {
    const collapsed = new Set(get().collapsed)
    const open = new Set(get().open)
    for (const k of keys) {
      if (startsCollapsed(k)) {
        if (expanded) open.add(k)
        else open.delete(k)
      } else if (expanded) collapsed.delete(k)
      else collapsed.add(k)
    }
    set({ collapsed, open })
    save({ collapsed: [...collapsed], open: [...open] })
  }
}))
