import { describe, expect, it } from 'vitest'
import {
  duration,
  money,
  pauseText,
  progressCounts,
  range
} from '../../src/renderer/src/lib/research'
import type { RunView, TaskView } from '../../src/shared/research'

const task = (id: string, status: TaskView['status'], parent: string | null = null): TaskView => ({
  id,
  title: id,
  stage: 1,
  status,
  parent,
  local: false,
  web: false,
  attempts: 0,
  startedAt: null,
  endedAt: null,
  costUsd: 0,
  error: null,
  note: null,
  output: null
})
const run = (tasks: TaskView[], over: Partial<RunView> = {}): RunView => ({
  id: 'r',
  status: 'running',
  pause: null,
  model: 'm',
  concurrency: 3,
  budgetCapUsd: 5,
  spentUsd: 0,
  skipWeb: false,
  startedAt: 0,
  endedAt: null,
  scope: null,
  tasks,
  ...over
})

describe('renderer research helpers', () => {
  it('counts steps, treating skipped as done and not counting group rows', () => {
    const r = run([
      task('a', 'done'),
      task('grp', 'running'),
      task('c1', 'done', 'grp'),
      task('c2', 'waiting', 'grp'),
      task('w', 'skipped'),
      task('f', 'failed')
    ])
    expect(progressCounts(r)).toEqual({ done: 3, total: 5 })
  })
  it('formats money, durations and ranges', () => {
    expect(money(0)).toBe('$0.00')
    expect(money(0.004)).toBe('<$0.01')
    expect(money(4.5)).toBe('$4.50')
    expect(duration(45_000)).toBe('45s')
    expect(duration(185_000)).toBe('3m 05s')
    expect(duration(3_720_000)).toBe('1h 02m')
    expect(range(2, 7, (n) => `$${n}`)).toBe('$2 to $7')
    expect(range(3, 3, (n) => `${n}`)).toBe('3')
  })
  it('shows live spend for a budget pause and the saved message otherwise', () => {
    expect(
      pauseText(
        run([], {
          status: 'paused',
          spentUsd: 5.31,
          budgetCapUsd: 5,
          pause: { reason: 'budget', message: 'stale $5.00' }
        })
      )
    ).toBe('Research has used $5.31 of your $5.00 budget.')
    expect(
      pauseText(
        run([], { status: 'paused', pause: { reason: 'no_credit', message: 'No credit.' } })
      )
    ).toBe('No credit.')
  })
})
