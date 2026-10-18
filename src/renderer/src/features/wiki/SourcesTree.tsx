import { useMemo } from 'react'
import { Lock, Plus } from 'lucide-react'
import type { SourcesTree as SourcesTreeData } from '@shared/wiki-tree'
import { useApp } from '@/store/app'
import { useWikiNav } from '@/store/wiki-nav'
import { formatDay } from './format'
import { Tree } from './Tree'
import { Highlight, SOURCE_KIND_LABEL, SourceIcon, TipHint, TipText, TipTitle } from './tree-parts'
import { buildSourceRows, type SourceRow } from './tree-rows'

/** The Sources tab (REQUIREMENTS-v3 4): every raw file, grouped, and who cites it. */

function RowContent({ row, query }: { row: SourceRow; query: string }) {
  switch (row.type) {
    case 'section':
      return (
        <span className="flex h-5 items-center gap-2">
          <span className="eyebrow text-[12px]">{row.label}</span>
          <span className="text-muted-foreground text-[12px] tabular-nums">
            {query.trim() ? `${row.count} of ${row.total}` : row.count}
          </span>
        </span>
      )
    case 'add':
      return (
        <span className="text-primary flex items-center gap-1.5 text-sm font-medium">
          <Plus className="size-3.5" strokeWidth={2} aria-hidden />
          Add files
        </span>
      )
    case 'group':
      return (
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className="truncate">{row.group.label}</span>
          <span className="text-muted-foreground text-[12px] font-normal tabular-nums">
            {row.group.sources.length}
          </span>
        </span>
      )
    case 'source': {
      const s = row.source
      return (
        <span className="flex min-w-0 items-start gap-1.5">
          <span className="mt-[3px]">
            <SourceIcon source={s} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-sm leading-5">
              <Highlight text={s.title} query={query} />
            </span>
            {!s.citedBy.length && (
              <span className="text-muted-foreground block text-[12px] leading-4">Not cited</span>
            )}
          </span>
          {s.private && (
            <span className="mt-[3px]">
              <Lock className="text-muted-foreground size-3" strokeWidth={2} aria-label="Private" />
            </span>
          )}
        </span>
      )
    }
  }
}

function RowTip({ row, altKey }: { row: SourceRow; altKey: string }) {
  switch (row.type) {
    case 'section':
      return (
        <>
          <TipTitle>{row.label}</TipTitle>
          <TipText>{row.help}</TipText>
          <TipHint>Click to show or hide. {altKey}-click to show or hide every section.</TipHint>
        </>
      )
    case 'add':
      return (
        <>
          <TipTitle>Add files</TipTitle>
          <TipText>
            Add decks, case studies, notes and other documents. They stay private and are never sent
            to web research.
          </TipText>
        </>
      )
    case 'group':
      return (
        <>
          <TipTitle>{row.group.label}</TipTitle>
          <TipText>
            {row.group.sources.length} {row.group.sources.length === 1 ? 'source' : 'sources'}.
          </TipText>
          <TipHint>Click to show or hide.</TipHint>
        </>
      )
    case 'source': {
      const s = row.source
      const n = s.citedBy.length
      return (
        <>
          <TipTitle
            sub={`${SOURCE_KIND_LABEL[s.kind]}${s.ingested ? `, saved ${formatDay(s.ingested)}` : ''}`}
          >
            {s.title}
          </TipTitle>
          {s.summary && <TipText muted>{s.summary}</TipText>}
          <TipText>
            {n
              ? `Cited by ${n} ${n === 1 ? 'article' : 'articles'}: ${s.citedBy
                  .slice(0, 4)
                  .map((c) => c.label)
                  .join(', ')}${n > 4 ? ` and ${n - 4} more` : ''}.`
              : 'Not cited by any article yet. The research may not have needed it.'}
          </TipText>
          {s.private && <TipText muted>Private: never sent to web research.</TipText>}
          <TipHint>Click to read it and see the articles that cite it.</TipHint>
        </>
      )
    }
  }
}

export function SourcesTree({
  tree,
  selectedId,
  query,
  onOpen
}: {
  tree: SourcesTreeData
  selectedId: string | null
  query: string
  onOpen: (id: string) => void
}) {
  const { collapsed, open, setManyExpanded } = useWikiNav()
  const altKey = useApp((s) => (s.state?.platform === 'mac' ? 'Option' : 'Alt'))
  const rows = useMemo(
    () => buildSourceRows(tree, { collapsed, open, setManyExpanded, onOpen }, query),
    [tree, collapsed, open, setManyExpanded, onOpen, query]
  )
  if (!rows.length) return <p className="text-muted-foreground px-2 text-sm">No sources match.</p>
  return (
    <Tree
      rows={rows}
      label="Sources"
      selectedId={selectedId}
      render={(r) => <RowContent row={r} query={query} />}
      tip={(r) => <RowTip row={r} altKey={altKey} />}
    />
  )
}
