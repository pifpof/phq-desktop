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
import type { Marker, SourceKind, TreeSource } from '@shared/wiki-tree'
import { cn } from '@/lib/utils'

/** Pieces both Wiki tabs share: markers, the attention dot, highlights and tooltip layout. */

export const MARKER_ICON: Record<Marker['kind'], { Icon: LucideIcon; className: string }> = {
  missing: { Icon: CircleDashed, className: 'text-muted-foreground' },
  outOfDate: { Icon: Clock, className: 'text-warning' },
  lowConfidence: { Icon: CircleAlert, className: 'text-warning' },
  decision: { Icon: Scale, className: 'text-primary' },
  private: { Icon: Lock, className: 'text-muted-foreground' }
}

/** What to do about each marker, for the tooltip. */
export const MARKER_ADVICE: Record<Marker['kind'], string> = {
  missing: 'Open it to generate it.',
  outOfDate: 'Re-run it to bring it up to date.',
  lowConfidence: 'Add your own files, or re-run it to look for more evidence.',
  decision: 'Research follows the decision whenever it rewrites this article.',
  private: 'Left out of exports unless you choose to include private articles.'
}

export const SOURCE_ICON: Record<SourceKind, LucideIcon> = {
  page: Globe,
  citation: Quote,
  file: FileText,
  social: AtSign,
  legacy: Archive,
  other: FileText
}

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  page: 'Web page',
  citation: 'Web citation',
  file: 'Your file',
  social: 'Social profile',
  legacy: 'From the old format',
  other: 'Source'
}

/** Up to two markers by priority; all of them for screen readers. */
export function Markers({ markers }: { markers: Marker[] }) {
  if (!markers.length) return null
  return (
    <span className="mt-0.5 flex shrink-0 items-center gap-1">
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
    <span className="bg-warning inline-block size-1.5 shrink-0 rounded-full">
      <span className="sr-only">{label}</span>
    </span>
  )
}

/** The label with the search text marked. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-warning-bg text-foreground rounded-[3px]">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  )
}

export function SourceIcon({ source }: { source: Pick<TreeSource, 'kind'> }) {
  const Icon = SOURCE_ICON[source.kind]
  return <Icon className="text-muted-foreground size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
}

/** Tooltip layout: a title, then short paragraphs, then a quiet hint. */
export function TipTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <p className="text-foreground font-semibold">
      {children}
      {sub && <span className="text-muted-foreground block text-[12px] font-normal">{sub}</span>}
    </p>
  )
}

export function TipText({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <p className={cn('mt-1.5', muted ? 'text-muted-foreground line-clamp-3' : 'text-foreground')}>
      {children}
    </p>
  )
}

export function TipMarkers({ markers }: { markers: Marker[] }) {
  if (!markers.length) return null
  return (
    <ul className="mt-2 space-y-1.5 border-t pt-2">
      {markers.map((m) => {
        const { Icon, className } = MARKER_ICON[m.kind]
        return (
          <li key={m.kind} className="flex gap-2">
            <Icon className={cn('mt-0.5 size-3.5 shrink-0', className)} strokeWidth={2} />
            <span>
              <span className="text-foreground">{m.text}.</span>{' '}
              <span className="text-muted-foreground">{MARKER_ADVICE[m.kind]}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function TipHint({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground mt-2 text-[12px]">{children}</p>
}
