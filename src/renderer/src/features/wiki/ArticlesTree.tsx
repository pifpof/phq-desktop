import { useMemo } from 'react'
import type { WikiTree } from '@shared/wiki-tree'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useWikiNav } from '@/store/wiki-nav'
import { Tree } from './Tree'
import {
  AttentionDot,
  Highlight,
  Markers,
  TipHint,
  TipMarkers,
  TipText,
  TipTitle
} from './tree-parts'
import { buildArticleRows, type ArticleRow } from './tree-rows'

/** The Articles tab (REQUIREMENTS-v3 3). Sources are listed at the end of each article. */

const ATTENTION = 'Something in here is out of date or low confidence'

function RowContent({ row, query }: { row: ArticleRow; query: string }) {
  if (row.type === 'section')
    return (
      <span className="flex h-5 items-center gap-2">
        <span className="eyebrow text-[12px]">{row.label}</span>
        <span className="text-muted-foreground text-[12px] tabular-nums">
          {query.trim() ? `${row.count} of ${row.total}` : row.count}
        </span>
        {row.attention && !row.expanded && <AttentionDot label={ATTENTION} />}
      </span>
    )
  const n = row.node
  return (
    <span className="flex min-w-0 items-start gap-2">
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'line-clamp-2 text-sm leading-5',
            n.kind === 'group' && 'font-medium',
            n.kind === 'placeholder' && 'italic'
          )}
        >
          <Highlight text={n.label} query={query} />
        </span>
        {n.subtitle && (
          <span className="text-muted-foreground block text-[12px] leading-4">{n.subtitle}</span>
        )}
      </span>
      {row.hasChildren && n.attention && !row.expanded && (
        <span className="mt-2">
          <AttentionDot label={ATTENTION} />
        </span>
      )}
      <Markers markers={n.markers} />
    </span>
  )
}

function RowTip({ row, altKey }: { row: ArticleRow; altKey: string }) {
  if (row.type === 'section')
    return (
      <>
        <TipTitle>{row.label}</TipTitle>
        <TipText>{row.help}</TipText>
        {row.attention && <TipText muted>{ATTENTION}.</TipText>}
        <TipHint>Click to show or hide. {altKey}-click to show or hide every section.</TipHint>
      </>
    )
  const n = row.node
  const showTitle = n.title !== n.label ? n.title : undefined
  return (
    <>
      <TipTitle sub={showTitle}>{n.label}</TipTitle>
      {n.help && <TipText>{n.help}</TipText>}
      {n.kind === 'article' && n.summary && <TipText muted>{n.summary}</TipText>}
      <TipMarkers markers={n.markers.filter((m) => m.kind !== 'missing')} />
      <TipHint>
        {n.kind === 'group'
          ? 'Click to show or hide.'
          : n.kind === 'placeholder'
            ? 'Not written yet. Click to generate it.'
            : row.hasChildren
              ? 'Click to open. Use the arrow to show or hide what is inside.'
              : 'Click to open.'}
      </TipHint>
    </>
  )
}

export function ArticlesTree({
  tree,
  selectedId,
  query,
  onOpen
}: {
  tree: WikiTree
  selectedId: string | null
  query: string
  onOpen: (id: string) => void
}) {
  const { collapsed, open, setManyExpanded } = useWikiNav()
  const altKey = useApp((s) => (s.state?.platform === 'mac' ? 'Option' : 'Alt'))
  const rows = useMemo(
    () => buildArticleRows(tree, { collapsed, open, setManyExpanded, onOpen }, query),
    [tree, collapsed, open, setManyExpanded, onOpen, query]
  )
  if (!rows.length)
    return (
      <p className="text-muted-foreground px-2 text-sm">
        No articles match. Try the Sources tab, or ask in Chat.
      </p>
    )
  return (
    <Tree
      rows={rows}
      label="Articles"
      selectedId={selectedId}
      render={(r) => <RowContent row={r} query={query} />}
      tip={(r) => <RowTip row={r} altKey={altKey} />}
    />
  )
}
