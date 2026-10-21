import type { RunView, TaskView } from '@shared/research'

/**
 * Time left in a run (REQUIREMENTS-v4.4 4.2). After 3 finished tasks: the median finished duration
 * times the work left, which is the longer of the longest chain of remaining tasks (they run one
 * after another) and all remaining tasks spread over the concurrency. A running task counts half.
 */

export const MIN_DONE = 3

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const open = (t: TaskView): boolean =>
  t.status === 'waiting' || t.status === 'running' || t.status === 'blocked'

/** Minutes left, unrounded, or null before there is enough to go on. */
export function minutesLeft(run: RunView, deps: Map<string, string[]>): number | null {
  const finished = run.tasks.filter(
    (t) => t.status === 'done' && !t.local && t.startedAt !== null && t.endedAt !== null
  )
  const counted = run.tasks.filter((t) => t.status === 'done').length
  if (counted < MIN_DONE || !finished.length) return null
  const m = median(finished.map((t) => t.endedAt! - t.startedAt!))
  const left = run.tasks.filter((t) => open(t) && !t.local)
  if (!left.length) return 0
  const weight = (t: TaskView): number => (t.status === 'running' ? 0.5 : 1)
  const byId = new Map(left.map((t) => [t.id, t]))
  const memo = new Map<string, number>()
  // Longest chain of remaining tasks ending at this one.
  const chain = (id: string, seen = new Set<string>()): number => {
    if (memo.has(id)) return memo.get(id)!
    if (seen.has(id)) return 0
    seen.add(id)
    const t = byId.get(id)!
    const before = (deps.get(t.parent ?? id) ?? []).filter((d) => byId.has(d))
    const v = weight(t) + Math.max(0, ...before.map((d) => chain(d, seen)))
    memo.set(id, v)
    return v
  }
  const longest = Math.max(...left.map((t) => chain(t.id)))
  const spread = left.reduce((a, t) => a + weight(t), 0) / Math.max(1, run.concurrency)
  return (m * Math.max(longest, spread)) / 60_000
}

/** Never let the shown number jump up by more than 2 minutes at once. */
export function smooth(prev: number | null, next: number | null): number | null {
  if (next === null || prev === null) return next
  return Math.min(next, prev + 2)
}

/** "About 6 minutes left", "About 1 minute left", "Almost done". */
export function timeLeftText(minutes: number | null): string | null {
  if (minutes === null) return null
  if (minutes < 1) return 'Almost done'
  const n = Math.round(minutes)
  return `About ${n} ${n === 1 ? 'minute' : 'minutes'} left`
}

/** What is happening now, in plain words (REQUIREMENTS-v4.4 4.2). */
export function stageLine(run: RunView, sectionTitles: Map<string, string>): string | null {
  const running = run.tasks.filter((t) => t.status === 'running' && !t.parent)
  if (!running.length) return null
  const t = [...running].sort((a, b) => b.stage - a.stage)[0]
  if (t.id === 'crawl-website') return 'Reading your website'
  if (t.id === 'extract-input-files') return 'Reading your files'
  if (t.id === 'playbook-assemble') return 'Putting your playbook together'
  if (t.id === 'messaging-analysis') return 'Checking your messaging'
  const section = sectionTitles.get(t.id)
  if (section) return `Writing ${section.toLowerCase()}`
  if (/competitor|competitive/.test(t.id)) return 'Researching competitors'
  return 'Researching your market'
}
