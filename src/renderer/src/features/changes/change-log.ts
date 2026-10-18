import type { Change, Regeneration } from '@shared/changes'

/**
 * The Changes tab's model (REQUIREMENTS-v3.1 3.6). Waiting changes are always pinned at the top;
 * applied, withdrawn and replaced ones (and regenerations, when shown) are grouped by date.
 * Pure, so the grouping and filters can be tested without a window.
 */

export type ChangeFilter = 'all' | 'waiting' | 'applied' | 'withdrawn'

export type LogEntry =
  | { kind: 'change'; id: string; date: string; change: Change }
  | { kind: 'regeneration'; id: string; date: string; regeneration: Regeneration }

export interface LogGroup {
  id: 'waiting' | 'today' | 'week' | 'earlier'
  label: string
  entries: LogEntry[]
}

export interface LogOptions {
  filter: ChangeFilter
  query: string
  /** Only changes made on, or affecting, this page. */
  page: string | null
  showRegenerations: boolean
  /** ISO day. */
  today: string
}

const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

const matchesQuery = (c: Change, q: string): boolean =>
  !q || [c.name, c.why, c.changeTo].some((f) => f.toLowerCase().includes(q))

const matchesFilter = (c: Change, f: ChangeFilter): boolean =>
  f === 'all' ||
  (f === 'waiting' && c.status === 'pending') ||
  (f === 'applied' && c.status === 'applied') ||
  (f === 'withdrawn' && (c.status === 'withdrawn' || c.status === 'replaced'))

export function buildChangeLog(
  changes: Change[],
  regenerations: Regeneration[],
  o: LogOptions
): LogGroup[] {
  const q = o.query.trim().toLowerCase()
  const onPage = (c: Change): boolean =>
    !o.page || c.page === o.page || c.affects.some((a) => a.slug === o.page)
  const shown = changes.filter((c) => onPage(c) && matchesQuery(c, q) && matchesFilter(c, o.filter))

  const waiting = shown
    .filter((c) => c.status === 'pending')
    .sort((a, b) => b.created.localeCompare(a.created) || b.id.localeCompare(a.id))
    .map<LogEntry>((c) => ({ kind: 'change', id: c.id, date: c.created, change: c }))

  const history: LogEntry[] = shown
    .filter((c) => c.status !== 'pending')
    .map((c) => ({ kind: 'change', id: c.id, date: c.statusDate, change: c }))
  // Regenerations are history too; hidden by default, never under a status filter or a search.
  if (o.showRegenerations && o.filter === 'all' && !q && !o.page)
    regenerations.forEach((r, i) =>
      history.push({
        kind: 'regeneration',
        id: `regen-${r.date}-${i}`,
        date: r.date,
        regeneration: r
      })
    )
  history.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))

  const groups: LogGroup[] = []
  if (waiting.length) groups.push({ id: 'waiting', label: 'Waiting', entries: waiting })
  const bucket = (e: LogEntry): LogGroup['id'] => {
    const d = daysBetween(e.date, o.today)
    return d <= 0 ? 'today' : d < 7 ? 'week' : 'earlier'
  }
  for (const [id, label] of [
    ['today', 'Today'],
    ['week', 'This week'],
    ['earlier', 'Earlier']
  ] as const) {
    const entries = history.filter((e) => bucket(e) === id)
    if (entries.length) groups.push({ id, label, entries })
  }
  return groups
}

/** The second line of a change row. */
export function changeLine(c: Change, formatDay: (d: string) => string): string {
  const where = `${c.pageTitle || 'No page'} · ${c.section ?? 'whole page'}`
  if (c.status === 'pending') return `${where} · ${formatDay(c.created)}`
  if (c.status === 'applied')
    return `Applied to ${c.pageTitle || 'the wiki'} on ${formatDay(c.statusDate)}`
  if (c.status === 'replaced') return `Replaced on ${formatDay(c.statusDate)}`
  return `Withdrawn on ${formatDay(c.statusDate)}`
}
