import { canRun, missingDeps, type RunView, type StepState, type TaskView } from '@shared/research'

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

// ---------------------------------------------------------------- choosing steps (REQUIREMENTS-v4.4 4A)

/** Step IDs that are part of the run that is going or paused. */
export function inRun(run: RunView | null): Set<string> {
  return new Set(isActive(run) && run ? run.tasks.filter((t) => !t.parent).map((t) => t.id) : [])
}

/** What "alongside" means for a step: ticked with it, or in the run that is going. */
const along = (selected: Set<string>, running: Set<string>): Set<string> =>
  new Set([...selected, ...running])

/** Can this step be ticked now? Not if it's in the run, done for good, or missing what it needs. */
export function canTick(
  step: StepState,
  steps: StepState[],
  selected: Set<string>,
  running: Set<string>
): boolean {
  if (running.has(step.id)) return false
  const byId = new Map(steps.map((s) => [s.id, s]))
  return canRun(step, byId, along(selected, running))
}

/** Ticks or unticks a step. Unticking also unticks every ticked step that needed it. */
export function toggleStep(
  id: string,
  steps: StepState[],
  selected: Set<string>,
  running: Set<string>
): Set<string> {
  const next = new Set(selected)
  if (!next.delete(id)) {
    next.add(id)
    return next
  }
  const byId = new Map(steps.map((s) => [s.id, s]))
  for (let moved = true; moved;) {
    moved = false
    for (const s of next) {
      if (missingDeps(byId.get(s)!, byId, along(next, running)).length) {
        next.delete(s)
        moved = true
      }
    }
  }
  return next
}

/** Every step without output, for "Run all remaining". Skipped steps are left: they'd skip again. */
export const remaining = (steps: StepState[], running: Set<string>): StepState[] =>
  steps.filter((s) => (s.status === 'not-run' || s.status === 'failed') && !running.has(s.id))

export function costOf(steps: StepState[]): { low: number; high: number } {
  return steps.reduce((a, s) => ({ low: a.low + s.costUsd.low, high: a.high + s.costUsd.high }), {
    low: 0,
    high: 0
  })
}

/** "About $0.40 to $0.60", "About $0.12", or "Free" for steps that call no AI. */
export function aboutCost(c: { low: number; high: number }): string {
  if (c.high <= 0) return 'Free'
  if (c.high < 0.01) return 'Under $0.01'
  if (c.low < 0.01) return `Up to ${money(c.high)}`
  return `About ${range(c.low, c.high, money)}`
}
