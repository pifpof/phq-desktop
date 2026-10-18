import { describe, expect, it } from 'vitest'
import type { Change } from '../../src/shared/changes'
import {
  buildChangeLog,
  changeLine,
  type LogOptions
} from '../../src/renderer/src/features/changes/change-log'

const change = (id: string, more: Partial<Change>): Change => ({
  id,
  path: `wiki/references/${id}.md`,
  name: id,
  page: 'ideal-customer-profile',
  pageTitle: 'Ideal Customer Profile',
  section: null,
  quote: '',
  why: '',
  changeTo: '',
  basedOn: [],
  affects: [],
  status: 'pending',
  statusDate: '2026-10-18',
  statusRef: '',
  created: '2026-10-18',
  legacy: false,
  private: false,
  ...more
})

const CHANGES: Change[] = [
  change('waiting-old', { created: '2026-10-10', why: 'buyers are sales leads' }),
  change('waiting-new', { created: '2026-10-18', page: 'market-overview', pageTitle: 'Why Now' }),
  change('applied-today', { status: 'applied', statusDate: '2026-10-18' }),
  change('applied-week', { status: 'applied', statusDate: '2026-10-14', created: '2026-10-13' }),
  change('legacy', { status: 'applied', statusDate: '2026-09-01', legacy: true }),
  change('withdrawn', { status: 'withdrawn', statusDate: '2026-10-01' }),
  change('replaced', { status: 'replaced', statusDate: '2026-10-17' })
]

const opts = (more: Partial<LogOptions> = {}): LogOptions => ({
  filter: 'all',
  query: '',
  page: null,
  showRegenerations: false,
  today: '2026-10-18',
  ...more
})

const shape = (groups: ReturnType<typeof buildChangeLog>): string[][] =>
  groups.map((g) => [g.label, ...g.entries.map((e) => e.id)])

describe('change log', () => {
  it('pins waiting changes on top, then Today, This week and Earlier', () => {
    expect(shape(buildChangeLog(CHANGES, [], opts()))).toEqual([
      ['Waiting', 'waiting-new', 'waiting-old'],
      ['Today', 'applied-today'],
      ['This week', 'replaced', 'applied-week'],
      ['Earlier', 'withdrawn', 'legacy']
    ])
  })

  it('filters by status: Withdrawn includes replaced ones', () => {
    expect(shape(buildChangeLog(CHANGES, [], opts({ filter: 'waiting' })))).toEqual([
      ['Waiting', 'waiting-new', 'waiting-old']
    ])
    expect(shape(buildChangeLog(CHANGES, [], opts({ filter: 'applied' })))).toEqual([
      ['Today', 'applied-today'],
      ['This week', 'applied-week'],
      ['Earlier', 'legacy']
    ])
    expect(shape(buildChangeLog(CHANGES, [], opts({ filter: 'withdrawn' })))).toEqual([
      ['This week', 'replaced'],
      ['Earlier', 'withdrawn']
    ])
  })

  it('searches name, why and change to; filters to a page', () => {
    expect(shape(buildChangeLog(CHANGES, [], opts({ query: 'SALES LEADS' })))).toEqual([
      ['Waiting', 'waiting-old']
    ])
    const page = shape(buildChangeLog(CHANGES, [], opts({ page: 'market-overview' })))
    expect(page).toEqual([['Waiting', 'waiting-new']])
  })

  it('adds regenerations only when asked, and only to the full list', () => {
    const regens = [{ date: '2026-10-18', text: 'Positioning Statement applying 2 changes' }]
    expect(shape(buildChangeLog(CHANGES, regens, opts()))).not.toContainEqual(
      expect.arrayContaining(['regen-2026-10-18-0'])
    )
    const shown = buildChangeLog(CHANGES, regens, opts({ showRegenerations: true }))
    expect(shown.find((g) => g.id === 'today')!.entries.map((e) => e.kind)).toEqual([
      'regeneration',
      'change'
    ])
    expect(
      buildChangeLog(CHANGES, regens, opts({ showRegenerations: true, filter: 'applied' }))
        .flatMap((g) => g.entries)
        .some((e) => e.kind === 'regeneration')
    ).toBe(false)
  })

  it('describes each change in one line', () => {
    const day = (d: string): string => d
    expect(changeLine(change('a', { section: 'Buyer roles' }), day)).toBe(
      'Ideal Customer Profile · Buyer roles · 2026-10-18'
    )
    expect(changeLine(change('b', { status: 'applied' }), day)).toBe(
      'Applied to Ideal Customer Profile on 2026-10-18'
    )
    expect(changeLine(change('c', { status: 'withdrawn' }), day)).toBe('Withdrawn on 2026-10-18')
  })
})
