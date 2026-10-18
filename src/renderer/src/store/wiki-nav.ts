import { create } from 'zustand'
import type { NavState, SourcesTree, WikiTree } from '@shared/wiki-tree'
import { api, unwrap } from '@/lib/api'

/**
 * The Wiki pane's trees and what is expanded (REQUIREMENTS-v3 3.3). Sections and parents start
 * expanded; source lists start collapsed. Saved per workspace in app state.
 */

interface WikiNavStore {
  articles: WikiTree | null
  sources: SourcesTree | null
  loaded: boolean
  /** Section and parent ids the person collapsed. */
  collapsed: Set<string>
  /** Article source lists and Cited by lists the person opened. */
  open: Set<string>
  load(): Promise<void>
  reloadTrees(): Promise<void>
  isExpanded(id: string): boolean
  setExpanded(id: string, expanded: boolean): void
  setManyExpanded(ids: string[], expanded: boolean): void
  isOpen(id: string): boolean
  toggleOpen(id: string): void
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
const save = (state: NavState): void => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void api.setNavState(state), 300)
}

export const useWikiNav = create<WikiNavStore>((set, get) => {
  const persist = (): void => save({ collapsed: [...get().collapsed], open: [...get().open] })
  return {
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
    isExpanded: (id) => !get().collapsed.has(id),
    setExpanded(id, expanded) {
      get().setManyExpanded([id], expanded)
    },
    setManyExpanded(ids, expanded) {
      const collapsed = new Set(get().collapsed)
      for (const id of ids) {
        if (expanded) collapsed.delete(id)
        else collapsed.add(id)
      }
      set({ collapsed })
      persist()
    },
    isOpen: (id) => get().open.has(id),
    toggleOpen(id) {
      const open = new Set(get().open)
      if (open.has(id)) open.delete(id)
      else open.add(id)
      set({ open })
      persist()
    }
  }
})
