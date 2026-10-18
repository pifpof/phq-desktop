import type { TreeNode, TreeSource, WikiTree } from '@shared/wiki-tree'

/**
 * Tree rows for the Wiki pane, flattened in display order (REQUIREMENTS-v3 3.3). Pure, so the
 * expand and collapse rules can be tested without a window.
 */

export interface TreeRowModel {
  id: string
  /** 1 for section headings. */
  level: number
  parentId: string | null
  /** Plain text, for type-ahead. */
  label: string
  /** Set when the row expands (children or sources); undefined when it doesn't. */
  expanded?: boolean
  /** Shows a chevron (children). Rows that expand to sources use a count instead. */
  chevron?: boolean
  heading?: boolean
  dim?: boolean
  toggle?: (alt: boolean) => void
  /** Space: the secondary toggle (an article's source list when it also has children). */
  secondary?: () => void
  activate?: () => void
}

/** Shown before "Show all N". */
const SOURCE_PREVIEW = 8

export const sectionKey = (id: string): string => `a:sec:${id}`
export const parentKey = (id: string): string => `a:par:${id}`
export const sourcesKey = (id: string): string => `a:src:${id}`
const allKey = (id: string): string => `a:all:${id}`

export type Row = TreeRowModel &
  (
    | { type: 'section'; count: number; attention: boolean }
    | { type: 'node'; node: TreeNode; sourcesOpen: boolean; hasChildren: boolean }
    | { type: 'source'; source: TreeSource }
    | { type: 'more'; total: number }
  )

export interface RowDeps {
  collapsed: Set<string>
  open: Set<string>
  setExpanded(id: string, expanded: boolean): void
  setManyExpanded(ids: string[], expanded: boolean): void
  toggleOpen(id: string): void
  onOpen(id: string): void
}

/** The visible rows, in order, for the current expand state. Pure, for tests. */
export function buildArticleRows(tree: WikiTree, d: RowDeps): Row[] {
  const { collapsed, open, setExpanded, setManyExpanded, toggleOpen, onOpen } = d
  const rows: Row[] = []
  const sectionIds = tree.sections.map((s) => sectionKey(s.id))

  const addSources = (n: TreeNode, level: number): void => {
    const all = open.has(allKey(n.id))
    const shown = all ? n.sources : n.sources.slice(0, SOURCE_PREVIEW)
    for (const s of shown)
      rows.push({
        type: 'source',
        source: s,
        id: `${n.id}>${s.path}`,
        level,
        parentId: n.id,
        label: s.title,
        activate: s.exists ? () => onOpen(s.path) : undefined
      })
    if (shown.length < n.sources.length)
      rows.push({
        type: 'more',
        total: n.sources.length,
        id: `${n.id}>more`,
        level,
        parentId: n.id,
        label: `Show all ${n.sources.length}`,
        activate: () => toggleOpen(allKey(n.id))
      })
  }

  const addNode = (n: TreeNode, level: number, parentId: string): void => {
    const hasChildren = n.children.length > 0
    const sourcesOpen = open.has(sourcesKey(n.id))
    const childrenOpen = hasChildren && !collapsed.has(parentKey(n.id))
    const toggleSources = n.sources.length ? () => toggleOpen(sourcesKey(n.id)) : undefined
    const toggleChildren = (): void => setExpanded(parentKey(n.id), !childrenOpen)
    rows.push({
      type: 'node',
      node: n,
      sourcesOpen,
      hasChildren,
      id: n.id,
      level,
      parentId,
      label: n.label,
      chevron: hasChildren,
      dim: n.kind === 'placeholder',
      // Children take the arrows; a source list does when there are no children.
      expanded: hasChildren ? childrenOpen : toggleSources ? sourcesOpen : undefined,
      toggle: hasChildren ? toggleChildren : toggleSources,
      secondary: toggleSources,
      // A real parent opens its article; a virtual one only toggles.
      activate: n.kind === 'group' ? undefined : () => onOpen(n.id)
    })
    if (sourcesOpen) addSources(n, level + 1)
    if (childrenOpen) for (const c of n.children) addNode(c, level + 1, n.id)
  }

  for (const s of tree.sections) {
    const key = sectionKey(s.id)
    const expanded = !collapsed.has(key)
    rows.push({
      type: 'section',
      count: s.count,
      attention: s.attention,
      id: key,
      level: 1,
      parentId: null,
      label: s.label,
      heading: true,
      chevron: true,
      expanded,
      // Option or Alt toggles every section (REQUIREMENTS-v3 3.3).
      toggle: (alt) => (alt ? setManyExpanded(sectionIds, !expanded) : setExpanded(key, !expanded))
    })
    if (expanded) for (const n of s.items) addNode(n, 2, key)
  }
  return rows
}
