import type { SourceGroup, SourceNode, SourcesTree, TreeNode, WikiTree } from '@shared/wiki-tree'

/**
 * Tree rows for the Wiki pane, flattened in display order (REQUIREMENTS-v3 3.3, 3.6, 4). Pure,
 * so the expand, collapse and search rules can be tested without a window.
 *
 * Section headings start collapsed (Shahed, 2026-10-18); parents inside a section start
 * expanded. Searching never changes the saved state, so clearing it restores what was open.
 */

export interface TreeRowModel {
  id: string
  /** 1 for section headings. */
  level: number
  parentId: string | null
  /** Plain text, for type-ahead. */
  label: string
  /** Set when the row expands; undefined when it doesn't. */
  expanded?: boolean
  heading?: boolean
  dim?: boolean
  toggle?: (alt: boolean) => void
  activate?: () => void
}

export const sectionKey = (id: string): string => `a:sec:${id}`
export const parentKey = (id: string): string => `a:par:${id}`
export const sourceSectionKey = (id: string): string => `s:sec:${id}`
export const sourceGroupKey = (section: string, id: string): string => `s:grp:${section}:${id}`

/** Headings start collapsed; everything else that expands starts expanded. */
export const startsCollapsed = (key: string): boolean => /^[as]:sec:/.test(key)

export function isExpanded(key: string, collapsed: Set<string>, open: Set<string>): boolean {
  return startsCollapsed(key) ? open.has(key) : !collapsed.has(key)
}

export type ArticleRow = TreeRowModel &
  (
    | { type: 'section'; count: number; total: number; attention: boolean; help: string }
    | { type: 'node'; node: TreeNode; hasChildren: boolean }
  )

export type SourceRow = TreeRowModel &
  (
    | { type: 'section'; count: number; total: number; attention: false; help: string }
    | { type: 'group'; group: SourceGroup }
    | { type: 'source'; source: SourceNode }
    | { type: 'add' }
  )

export interface RowDeps {
  collapsed: Set<string>
  open: Set<string>
  setManyExpanded(ids: string[], expanded: boolean): void
  onOpen(id: string): void
}

/** Case-insensitive match on what a person would type. */
export function matches(query: string, ...fields: (string | string[])[]): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return fields.flat().some((f) => f.toLowerCase().includes(q))
}

const nodeMatches = (n: TreeNode, q: string): boolean =>
  n.kind !== 'placeholder' && matches(q, n.label, n.title, n.aliases, n.summary)

/** The node with only its matching descendants, or null when nothing in it matches. */
function filterNode(n: TreeNode, q: string): TreeNode | null {
  const children = n.children.map((c) => filterNode(c, q)).filter((c): c is TreeNode => !!c)
  if (!children.length && !nodeMatches(n, q)) return null
  return { ...n, children }
}

const countArticles = (nodes: TreeNode[]): number =>
  nodes.reduce((n, x) => n + (x.kind === 'article' ? 1 : 0) + countArticles(x.children), 0)

/** The visible Articles rows for the current expand state and search. */
export function buildArticleRows(tree: WikiTree, d: RowDeps, query = ''): ArticleRow[] {
  const { collapsed, open, setManyExpanded, onOpen } = d
  const searching = query.trim().length > 0
  const rows: ArticleRow[] = []
  const sectionIds = tree.sections.map((s) => sectionKey(s.id))
  const expanded = (key: string): boolean => searching || isExpanded(key, collapsed, open)

  const addNode = (n: TreeNode, level: number, parentId: string): void => {
    const hasChildren = n.children.length > 0
    const key = parentKey(n.id)
    const childrenOpen = hasChildren && expanded(key)
    rows.push({
      type: 'node',
      node: n,
      hasChildren,
      id: n.id,
      level,
      parentId,
      label: n.label,
      dim: n.kind === 'placeholder',
      expanded: hasChildren ? childrenOpen : undefined,
      toggle: hasChildren ? () => setManyExpanded([key], !childrenOpen) : undefined,
      // A real parent opens its article; a virtual one only toggles.
      activate: n.kind === 'group' ? undefined : () => onOpen(n.id)
    })
    if (childrenOpen) for (const c of n.children) addNode(c, level + 1, n.id)
  }

  for (const s of tree.sections) {
    const items = searching
      ? s.items.map((n) => filterNode(n, query)).filter((n): n is TreeNode => !!n)
      : s.items
    if (searching && !items.length) continue
    const key = sectionKey(s.id)
    const open_ = expanded(key)
    rows.push({
      type: 'section',
      count: searching ? countArticles(items) : s.count,
      total: s.count,
      attention: s.attention,
      help: s.help,
      id: key,
      level: 1,
      parentId: null,
      label: s.label,
      heading: true,
      expanded: open_,
      // Option or Alt toggles every section (REQUIREMENTS-v3 3.3).
      toggle: (alt) => setManyExpanded(alt ? sectionIds : [key], !open_)
    })
    if (open_) for (const n of items) addNode(n, 2, key)
  }
  return rows
}

/** The visible Sources rows (REQUIREMENTS-v3 4). */
export function buildSourceRows(tree: SourcesTree, d: RowDeps, query = ''): SourceRow[] {
  const { collapsed, open, setManyExpanded, onOpen } = d
  const searching = query.trim().length > 0
  const rows: SourceRow[] = []
  const sectionIds = tree.sections.map((s) => sourceSectionKey(s.id))
  const expanded = (key: string): boolean => searching || isExpanded(key, collapsed, open)
  const hit = (s: SourceNode): boolean => matches(query, s.title, s.summary)

  const addSource = (s: SourceNode, level: number, parentId: string): void => {
    rows.push({
      type: 'source',
      source: s,
      id: s.path,
      level,
      parentId,
      label: s.title,
      activate: () => onOpen(s.path)
    })
  }

  for (const sec of tree.sections) {
    const direct = sec.sources.filter(hit)
    const groups = sec.groups
      .map((g) => ({ ...g, sources: g.sources.filter(hit) }))
      .filter((g) => g.sources.length)
    const count = direct.length + groups.reduce((n, g) => n + g.sources.length, 0)
    if (searching && !count) continue
    const key = sourceSectionKey(sec.id)
    const open_ = expanded(key)
    rows.push({
      type: 'section',
      count,
      total: sec.count,
      attention: false,
      help: sec.help,
      id: key,
      level: 1,
      parentId: null,
      label: sec.label,
      heading: true,
      expanded: open_,
      toggle: (alt) => setManyExpanded(alt ? sectionIds : [key], !open_)
    })
    if (!open_) continue
    // Adding files stays where the files are (REQUIREMENTS-v3 4).
    if (sec.id === 'files' && !searching)
      rows.push({
        type: 'add',
        id: 'files',
        level: 2,
        parentId: key,
        label: 'Add files',
        activate: () => onOpen('files')
      })
    for (const g of groups) {
      const gk = sourceGroupKey(sec.id, g.id)
      const gOpen = expanded(gk)
      rows.push({
        type: 'group',
        group: g,
        id: gk,
        level: 2,
        parentId: key,
        label: g.label,
        expanded: gOpen,
        toggle: () => setManyExpanded([gk], !gOpen)
      })
      if (gOpen) for (const s of g.sources) addSource(s, 3, gk)
    }
    for (const s of direct) addSource(s, 2, key)
  }
  return rows
}

/** Every key that expands, for Expand all and Collapse all. */
export function allArticleKeys(tree: WikiTree): string[] {
  const keys = tree.sections.map((s) => sectionKey(s.id))
  const walk = (nodes: TreeNode[]): void => {
    for (const n of nodes)
      if (n.children.length) {
        keys.push(parentKey(n.id))
        walk(n.children)
      }
  }
  for (const s of tree.sections) walk(s.items)
  return keys
}

export function allSourceKeys(tree: SourcesTree): string[] {
  return tree.sections.flatMap((s) => [
    sourceSectionKey(s.id),
    ...s.groups.map((g) => sourceGroupKey(s.id, g.id))
  ])
}
