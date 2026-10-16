import type { RunView, TaskView } from '@shared/research'

export const STAGE_TITLES: Record<number, string> = {
  1: 'Reading and first research',
  2: 'Deeper research',
  3: 'Pulling it together',
  4: 'Writing your playbook',
  5: 'Reviewing your messaging'
}

/** Group rows (competitor profiles) only stand for their children, so they are not counted. */
const isGroup = (run: RunView, t: TaskView): boolean => run.tasks.some((c) => c.parent === t.id)

export function progressCounts(run: RunView): { done: number; total: number } {
  const counted = run.tasks.filter((t) => !isGroup(run, t))
  return {
    done: counted.filter((t) => t.status === 'done' || t.status === 'skipped').length,
    total: counted.length
  }
}

export const isActive = (run: RunView | null): boolean =>
  run?.status === 'running' || run?.status === 'paused'
export const playbookPublished = (run: RunView | null): boolean =>
  !!run?.tasks.some((t) => t.id === 'playbook-assemble' && t.status === 'done')

/** What a paused run says. Budget numbers are live: tasks already running keep finishing after the pause. */
export function pauseText(run: RunView): string {
  if (run.pause?.reason === 'budget')
    return `Research has used ${money(run.spentUsd)} of your ${money(run.budgetCapUsd)} budget.`
  return run.pause?.message ?? 'Research is paused.'
}

export function money(usd: number): string {
  return usd < 0.01 && usd > 0 ? '<$0.01' : `$${usd.toFixed(2)}`
}

/** "45s", "3m 05s", "1h 02m". */
export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

export function range(low: number, high: number, fmt: (n: number) => string): string {
  return fmt(low) === fmt(high) ? fmt(low) : `${fmt(low)} to ${fmt(high)}`
}
