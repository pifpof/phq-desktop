import { describe, expect, it } from 'vitest'
import type { StepState } from '../../src/shared/research'
import {
  aboutCost,
  canTick,
  costOf,
  remaining,
  toggleStep
} from '../../src/renderer/src/lib/research'

const step = (id: string, dependsOn: string[] = [], o: Partial<StepState> = {}): StepState => ({
  id,
  title: id,
  description: '',
  stage: 1,
  status: 'not-run',
  at: null,
  note: null,
  dependsOn,
  open: null,
  regenerate: null,
  rerunnable: false,
  costUsd: { low: 0.1, high: 0.2 },
  ...o
})

const STEPS = [
  step('find'),
  step('profile', ['find']),
  step('compare', ['profile']),
  step('written', [], { status: 'done', regenerate: 'x' }),
  step('crawl', [], { status: 'done', rerunnable: true, costUsd: { low: 0, high: 0 } }),
  step('social', ['crawl']),
  step('skipped', [], { status: 'skipped' }),
  step('after-skip', ['skipped'])
]
const none = new Set<string>()

describe('choosing steps (REQUIREMENTS-v4.4 4A.3)', () => {
  it('a step can be ticked only when what it needs has output, is ticked, or is running', () => {
    const tick = (id: string, sel = none, run = none) =>
      canTick(
        STEPS.find((s) => s.id === id)!,
        STEPS,
        sel,
        run
      )
    expect(tick('find')).toBe(true)
    expect(tick('profile')).toBe(false)
    expect(tick('profile', new Set(['find']))).toBe(true)
    expect(tick('profile', none, new Set(['find']))).toBe(true)
    expect(tick('social')).toBe(true)
    expect(tick('after-skip')).toBe(true)
    // done and written to the wiki: Regenerate only
    expect(tick('written')).toBe(false)
    // done, but only adds a new source
    expect(tick('crawl')).toBe(true)
    // already in the run
    expect(tick('find', none, new Set(['find']))).toBe(false)
  })

  it('unticking a step unticks everything that needed it', () => {
    let sel = toggleStep('find', STEPS, none, none)
    sel = toggleStep('profile', STEPS, sel, none)
    sel = toggleStep('compare', STEPS, sel, none)
    sel = toggleStep('social', STEPS, sel, none)
    expect([...sel].sort()).toEqual(['compare', 'find', 'profile', 'social'])
    expect([...toggleStep('find', STEPS, sel, none)]).toEqual(['social'])
    // what is running keeps its dependents ticked
    const running = new Set(['find'])
    expect([...toggleStep('social', STEPS, new Set(['profile', 'social']), running)]).toEqual([
      'profile'
    ])
  })

  it('run all remaining takes steps without output, and costs add up', () => {
    expect(remaining(STEPS, new Set(['find'])).map((s) => s.id)).toEqual([
      'profile',
      'compare',
      'social',
      'after-skip'
    ])
    expect(costOf(STEPS.slice(0, 3)).low).toBeCloseTo(0.3)
    expect(costOf(STEPS.slice(0, 3)).high).toBeCloseTo(0.6)
    expect(aboutCost({ low: 0.3, high: 0.6 })).toBe('About $0.30 to $0.60')
    expect(aboutCost({ low: 0, high: 0 })).toBe('Free')
  })
})
