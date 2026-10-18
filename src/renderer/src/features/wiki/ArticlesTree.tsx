import { useMemo } from 'react'
import {
  Archive,
  AtSign,
  CircleAlert,
  CircleDashed,
  Clock,
  FileText,
  Globe,
  Lock,
  Quote,
  Scale,
  type LucideIcon
} from 'lucide-react'
import type { Marker, SourceKind, TreeNode, TreeSource, WikiTree } from '@shared/wiki-tree'
import { cn } from '@/lib/utils'
import { useWikiNav } from '@/store/wiki-nav'
import { Tree } from './Tree'
import { buildArticleRows, sourcesKey, type Row } from './tree-rows'

/** The Articles tab (REQUIREMENTS-v3 3): sections, parents, articles and their sources. */

const MARKER_ICON: Record<Marker['kind'], { Icon: LucideIcon; className: string }> = {
  missing: { Icon: CircleDashed, className: 'text-muted-foreground' },
  outOfDate: { Icon: Clock, className: 'text-warning' },
  lowConfidence: { Icon: CircleAlert, className: 'text-warning' },
  decision: { Icon: Scale, className: 'text-primary' },
  private: { Icon: Lock, className: 'text-muted-foreground' }
}

export const SOURCE_ICON: Record<SourceKind, LucideIcon> = {
  page: Globe,
  citation: Quote,
  file: FileText,
  social: AtSign,
  legacy: Archive,
  other: FileText
}

/** Up to two markers by priority; all of them in the tooltip and for screen readers. */
export function Markers({ markers }: { markers: Marker[] }) {
  if (!markers.length) return null
  return (
    <span
      className="flex shrink-0 items-center gap-1"
      title={markers.map((m) => m.text).join('\n')}
    >
      {markers.slice(0, 2).map((m) => {
        const { Icon, className } = MARKER_ICON[m.kind]
        return (
          <Icon key={m.kind} className={cn('size-3.5', className)} strokeWidth={2} aria-hidden />
        )
      })}
      <span className="sr-only">{markers.map((m) => m.text).join('. ')}</span>
    </span>
  )
}

export function AttentionDot({ label }: { label: string }) {
  return (
    <span className="bg-warning inline-block size-1.5 shrink-0 rounded-full" title={label}>
      <span className="sr-only">{label}</span>
    </span>
  )
}

function tooltip(n: TreeNode): string {
  return [n.title, n.summary, ...n.markers.map((m) => m.text)].filter(Boolean).join('\n')
}

export function SourceLine({ source }: { source: TreeSource }) {
  const Icon = SOURCE_ICON[source.kind]
  if (!source.exists)
    return (
      <span
        className="text-destructive flex min-w-0 items-center gap-1.5 text-[13px]"
        title="This file is missing. Re-run the research that wrote the article to replace it."
      >
        <span className="truncate">Missing: {source.path}</span>
      </span>
    )
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[13px]" title={source.title}>
      <Icon className="text-muted-foreground size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
      <span className="truncate">{source.title}</span>
      {source.private && (
        <Lock
          className="text-muted-foreground size-3 shrink-0"
          strokeWidth={2}
          aria-label="Private"
        />
      )}
    </span>
  )
}

function useArticleRows(tree: WikiTree | null, onOpen: (id: string) => void): Row[] {
  const { collapsed, open, setExpanded, setManyExpanded, toggleOpen } = useWikiNav()
  return useMemo(
    () =>
      tree
        ? buildArticleRows(tree, {
            collapsed,
            open,
            setExpanded,
            setManyExpanded,
            toggleOpen,
            onOpen
          })
        : [],
    [tree, collapsed, open, setExpanded, setManyExpanded, toggleOpen, onOpen]
  )
}

function RowContent({ row }: { row: Row }) {
  const toggleOpen = useWikiNav((s) => s.toggleOpen)
  switch (row.type) {
    case 'section':
      return (
        <span className="flex h-5 items-center gap-2">
          <span className="eyebrow text-[12px]">{row.label}</span>
          <span className="text-muted-foreground text-[12px] tabular-nums">{row.count}</span>
          {row.attention && !row.expanded && (
            <AttentionDot label="Something in this section is out of date or low confidence" />
          )}
        </span>
      )
    case 'node': {
      const n = row.node
      return (
        <span className="flex min-w-0 items-start gap-2" title={tooltip(n)}>
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                'line-clamp-2 text-sm leading-5',
                n.kind === 'group' ? 'font-medium' : '',
                n.kind === 'placeholder' && 'italic'
              )}
            >
              {n.label}
            </span>
            {n.subtitle && (
              <span className="text-muted-foreground block text-[12px] leading-4">
                {n.subtitle}
              </span>
            )}
          </span>
          {row.hasChildren && n.attention && !row.expanded && (
            <span className="mt-2">
              <AttentionDot label="Something here is out of date or low confidence" />
            </span>
          )}
          <span className="mt-0.5 flex shrink-0 items-center gap-1.5">
            <Markers markers={n.markers} />
            {n.sources.length > 0 && (
              <span
                role="presentation"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleOpen(sourcesKey(n.id))
                }}
                className={cn(
                  'rounded-[6px] px-1 text-[12px] tabular-nums hover:bg-white',
                  row.sourcesOpen ? 'text-primary' : 'text-muted-foreground'
                )}
                title={`${row.sourcesOpen ? 'Hide' : 'Show'} sources (Space)`}
              >
                {n.sources.length} {n.sources.length === 1 ? 'source' : 'sources'}
              </span>
            )}
          </span>
        </span>
      )
    }
    case 'source':
      return <SourceLine source={row.source} />
    case 'more':
      return <span className="text-primary text-[13px]">Show all {row.total}</span>
  }
}

export function ArticlesTree({
  tree,
  selectedId,
  onOpen
}: {
  tree: WikiTree
  selectedId: string | null
  onOpen: (id: string) => void
}) {
  const rows = useArticleRows(tree, onOpen)
  return (
    <Tree
      rows={rows}
      label="Articles"
      selectedId={selectedId}
      render={(r) => <RowContent row={r as Row} />}
    />
  )
}
