import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Ellipsis, Search, X } from 'lucide-react'
import type { TreeNode, WikiTree } from '@shared/wiki-tree'
import { Button } from '@/components/ui/button'
import { ApiError, api } from '@/lib/api'
import { isActive } from '@/lib/research'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useResearch } from '@/store/research'
import { useWikiNav } from '@/store/wiki-nav'
import { useChanges, waitingCount } from '@/store/changes'
import { ChangeDetail } from '@/features/changes/ChangeDetail'
import { ChangesTab } from '@/features/changes/ChangesTab'
import { ArticlesTree } from './ArticlesTree'
import { ArticleView } from './ArticleView'
import { FilesPane } from './FilesPane'
import { PlaceholderPane } from './PlaceholderPane'
import { ProfilePane } from './ProfilePane'
import { SocialPane } from './SocialPane'
import { SourcesTree } from './SourcesTree'
import { SourceView } from './SourceView'
import {
  allArticleKeys,
  allSourceKeys,
  parentKey,
  sectionKey,
  sourceGroupKey,
  sourceSectionKey
} from './tree-rows'

const PROFILE = 'wiki/references/company-profile.md'
const SOCIAL = 'wiki/references/social-taglines.md'

/** Pane width (REQUIREMENTS-v3 3.8), remembered on this computer. */
const WIDTH = { min: 240, max: 420, initial: 280 }
const WIDTH_KEY = 'phq.wikiPaneWidth'
const clampWidth = (w: number): number => Math.min(WIDTH.max, Math.max(WIDTH.min, Math.round(w)))
function readWidth(): number {
  try {
    const w = Number(localStorage.getItem(WIDTH_KEY))
    return w ? clampWidth(w) : WIDTH.initial
  } catch {
    return WIDTH.initial
  }
}
function writeWidth(w: number): void {
  try {
    localStorage.setItem(WIDTH_KEY, String(w))
  } catch {
    // storage unavailable: the width lasts for this session only
  }
}

type Tab = 'articles' | 'sources' | 'changes'

const isChange = (p: string | null): boolean => !!p && /^wiki\/references\/decision-/.test(p)

/** The section and parent keys above a node, so a node opened from elsewhere can be shown. */
function ancestorKeys(tree: WikiTree, id: string): string[] | null {
  const walk = (nodes: TreeNode[], trail: string[]): string[] | null => {
    for (const n of nodes) {
      if (n.id === id) return trail
      const hit = walk(n.children, [...trail, parentKey(n.id)])
      if (hit) return hit
    }
    return null
  }
  for (const s of tree.sections) {
    const hit = walk(s.items, [sectionKey(s.id)])
    if (hit) return hit
  }
  return null
}

function findNode(tree: WikiTree | null, id: string): TreeNode | null {
  const walk = (nodes: TreeNode[]): TreeNode | null => {
    for (const n of nodes) {
      if (n.id === id) return n
      const hit = walk(n.children)
      if (hit) return hit
    }
    return null
  }
  for (const s of tree?.sections ?? []) {
    const hit = walk(s.items)
    if (hit) return hit
  }
  return null
}

function TreeMenu({ keys }: { keys: () => string[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const pick = (expanded: boolean): void => {
    useWikiNav.getState().setManyExpanded(keys(), expanded)
    setOpen(false)
  }
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Tree options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-ring/50 flex size-7 items-center justify-center rounded-[8px] outline-none focus-visible:ring-[3px]"
      >
        <Ellipsis className="size-4" strokeWidth={2} />
      </button>
      {open && (
        <div
          role="menu"
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          className="absolute top-8 right-0 z-20 w-40 rounded-2xl border bg-white p-1.5 text-sm shadow-[var(--shadow-menu)]"
        >
          {(
            [
              ['Expand all', true],
              ['Collapse all', false]
            ] as const
          ).map(([label, expanded]) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              autoFocus={expanded}
              onClick={() => pick(expanded)}
              className="hover:bg-secondary focus-visible:bg-secondary w-full rounded-[10px] px-3 py-1.5 text-left outline-none"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Drag the pane's right edge; double-click resets it. Arrow keys work too. */
function ResizeHandle({ width, onWidth }: { width: number; onWidth: (w: number) => void }) {
  const start = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const x0 = e.clientX
    const w0 = width
    const move = (ev: PointerEvent): void => onWidth(clampWidth(w0 + ev.clientX - x0))
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      onWidth(clampWidth(width + (e.key === 'ArrowRight' ? 16 : -16)))
    }
  }
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the wiki list"
      aria-valuemin={WIDTH.min}
      aria-valuemax={WIDTH.max}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onPointerDown={start}
      onDoubleClick={() => onWidth(WIDTH.initial)}
      onKeyDown={onKey}
      className="hover:bg-primary-light/40 focus-visible:bg-primary-light/60 absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize outline-none"
    />
  )
}

export function WikiView() {
  const target = useApp((s) => s.wikiTarget)
  const workspace = useApp((s) => s.state?.workspacePath)
  const isMac = useApp((s) => s.state?.platform === 'mac')
  const { articles, sources, loaded } = useWikiNav()
  const [tab, setTab] = useState<Tab>(target?.tab ?? 'articles')
  const [selected, setSelected] = useState<string | null>(target?.path ?? null)
  const [query, setQuery] = useState('')
  const [changesPage, setChangesPage] = useState<{ slug: string; title: string } | null>(null)
  const waiting = useChanges((s) => waitingCount(s.changes))
  const [width, setWidth] = useState(readWidth)
  const [error, setError] = useState<string | null>(null)
  const search = useRef<HTMLInputElement>(null)
  const run = useResearch((s) => s.run)

  useEffect(() => {
    void useWikiNav.getState().load()
    return api.onWikiTreeChanged(() => void useWikiNav.getState().reloadTrees())
  }, [workspace])

  // Sent here from another view (a source link, a link in the playbook): show that file.
  useEffect(() => {
    if (!target) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- following a navigation request
    setTab(target.tab)
    setSelected(target.path)
    useApp.setState({ wikiTarget: null })
  }, [target])

  // Make sure the opened file is visible: expand its section and parents.
  useEffect(() => {
    if (!selected) return
    const nav = useWikiNav.getState()
    let keys: string[] = []
    if (selected.startsWith('raw/') && sources) {
      for (const s of sources.sections) {
        if (s.sources.some((x) => x.path === selected)) keys = [sourceSectionKey(s.id)]
        for (const g of s.groups)
          if (g.sources.some((x) => x.path === selected))
            keys = [sourceSectionKey(s.id), sourceGroupKey(s.id, g.id)]
      }
    } else if (selected === 'files') keys = [sourceSectionKey('files')]
    else if (articles) keys = ancestorKeys(articles, selected) ?? []
    const closed = keys.filter((k) => !nav.isExpanded(k))
    if (closed.length) nav.setManyExpanded(closed, true)
  }, [articles, sources, selected])

  const open = useCallback((id: string) => {
    setSelected(id)
    setTab(
      id.startsWith('raw/') || id === 'files' ? 'sources' : isChange(id) ? 'changes' : 'articles'
    )
  }, [])
  // A page's waiting marker opens the Changes tab for that page (REQUIREMENTS-v3.1 3.6).
  const showPageChanges = useCallback((node: TreeNode) => {
    if (!node.slug) return
    setChangesPage({ slug: node.slug, title: node.label })
    setTab('changes')
    setSelected(null)
  }, [])

  const rerun = async (taskId: string): Promise<void> => {
    setError(null)
    try {
      await useResearch.getState().rerun({ taskIds: [taskId] })
      useApp.getState().go('progress')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start. Please try again.')
    }
  }

  const resize = (w: number): void => {
    setWidth(w)
    writeWidth(w)
  }

  // Cmd or Ctrl+F searches while the pane has focus (REQUIREMENTS-v3 3.6).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault()
      search.current?.focus()
      search.current?.select()
    }
  }

  const placeholder = selected?.startsWith('missing:') ? findNode(articles, selected) : null
  const empty =
    tab === 'articles'
      ? !articles?.sections.length
      : tab === 'sources'
        ? !sources?.sections.length
        : false

  return (
    <div className="flex h-full" onKeyDown={onKeyDown}>
      <nav className="relative flex shrink-0 flex-col border-r" style={{ width }} aria-label="Wiki">
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px]">Wiki</h2>
            {tab === 'articles' && articles && <TreeMenu keys={() => allArticleKeys(articles)} />}
            {tab === 'sources' && sources && <TreeMenu keys={() => allSourceKeys(sources)} />}
          </div>
          <div
            role="tablist"
            aria-label="Wiki sections"
            className="bg-secondary mt-3 grid grid-cols-3 rounded-[10px] p-0.5 text-sm"
          >
            {(['articles', 'sources', 'changes'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => {
                  setTab(t)
                  setSelected(null)
                  if (t !== 'changes') setChangesPage(null)
                }}
                className={cn(
                  'flex items-center justify-center gap-1 rounded-[8px] py-1.5 font-medium',
                  tab === t ? 'text-primary bg-white shadow-sm' : 'text-muted-foreground'
                )}
              >
                {t === 'articles' ? 'Articles' : t === 'sources' ? 'Sources' : 'Changes'}
                {t === 'changes' && waiting > 0 && (
                  <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[11px] leading-4 font-semibold tabular-nums">
                    {waiting}
                    <span className="sr-only"> waiting</span>
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="relative mt-3">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
              strokeWidth={2}
              aria-hidden
            />
            <input
              ref={search}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && query) {
                  e.preventDefault()
                  setQuery('')
                }
              }}
              placeholder={`Search ${tab} (${isMac ? 'Cmd' : 'Ctrl'}+F)`}
              aria-label={`Search ${tab}`}
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-[10px] border bg-white pr-7 pl-8 text-sm outline-none placeholder:text-[13px] focus-visible:ring-[3px] [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('')
                  search.current?.focus()
                }}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
              >
                <X className="size-3.5" strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-1" data-tree-pane>
          {empty ? (
            loaded && (
              <p className="text-muted-foreground px-2 text-sm">
                {tab === 'articles'
                  ? 'No articles yet. Run research to write them.'
                  : 'No sources yet.'}
              </p>
            )
          ) : tab === 'articles' ? (
            <ArticlesTree
              tree={articles!}
              selectedId={selected}
              query={query}
              onOpen={open}
              onPendingMarker={showPageChanges}
            />
          ) : tab === 'sources' ? (
            <SourcesTree tree={sources!} selectedId={selected} query={query} onOpen={open} />
          ) : (
            <ChangesTab
              query={query}
              selected={selected}
              page={changesPage}
              onClearPage={() => setChangesPage(null)}
              onOpen={open}
            />
          )}
        </div>
        <div className="border-t px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={isActive(run)}
            onClick={() => useApp.getState().startFlow('research')}
          >
            Re-run all research
          </Button>
        </div>
        <ResizeHandle width={width} onWidth={resize} />
      </nav>

      <section className="min-w-0 flex-1">
        {error && <p className="text-destructive border-b px-6 py-2 text-sm">{error}</p>}
        {!selected && (
          <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-center text-sm">
            <p className="max-w-[360px]">
              {tab === 'articles'
                ? 'Open a section on the left, then choose an article. Hover over anything to see what it is for.'
                : tab === 'sources'
                  ? 'Open a section on the left, then choose a source to read it and see which articles cite it.'
                  : 'Choose a change to see what was asked for, why, and what it affects.'}
            </p>
          </div>
        )}
        {selected === PROFILE && <ProfilePane />}
        {selected === 'files' && <FilesPane />}
        {selected === SOCIAL && <SocialPane onRerun={() => void rerun('social-taglines')} />}
        {placeholder && (
          <PlaceholderPane
            node={placeholder}
            running={isActive(run)}
            onGenerate={(t) => void rerun(t)}
          />
        )}
        {isChange(selected) && <ChangeDetail path={selected!} />}
        {selected?.startsWith('wiki/') &&
          !isChange(selected) &&
          selected !== PROFILE &&
          selected !== SOCIAL && (
            <ArticleView key={selected} path={selected} onRerun={(t) => void rerun(t)} />
          )}
        {selected?.startsWith('raw/') && <SourceView path={selected} />}
      </section>
    </div>
  )
}
