import { describe, expect, it } from 'vitest'
import type { Change } from '../../src/shared/changes'
import { regenWarnings, type RegenPlan } from '../../src/shared/regen'
import { describeEdits, diffLines } from '../../src/shared/diff'

const change = (id: string, more: Partial<Change> = {}): Change => ({
  id,
  path: `wiki/references/${id}.md`,
  name: id,
  page: 'ideal-customer-profile',
  pageTitle: 'Ideal Customer Profile',
  section: 'Buyer roles',
  quote: '',
  why: '',
  changeTo: `Text for ${id}`,
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

const plan = (more: Partial<RegenPlan> = {}): RegenPlan =>
  ({
    page: { slug: 'ideal-customer-profile', title: 'Ideal Customer Profile', path: 'x' },
    respected: [],
    outsideEdit: { edited: false, canDescribe: false },
    pagePrivate: false,
    ...more
  }) as RegenPlan

describe('regenerate warnings (REQUIREMENTS-v3.1 4.2)', () => {
  it('warns when two included changes rewrite the same section differently', () => {
    const w = regenWarnings(plan(), [change('a'), change('b')])
    expect(w.map((x) => x.kind)).toEqual(['sameSection'])
    expect(w[0].text).toContain('These two changes both rewrite Buyer roles')
    // Same instruction twice, or whole-page changes, are not a conflict.
    expect(regenWarnings(plan(), [change('a'), change('b', { changeTo: 'Text for a' })])).toEqual(
      []
    )
    expect(
      regenWarnings(plan(), [change('a', { section: null }), change('b', { section: null })])
    ).toEqual([])
  })

  it('warns when a change may undo an applied one on the same section, naming it', () => {
    const earlier = change('earlier', { status: 'applied', name: 'Lead with founders' })
    const w = regenWarnings(plan({ respected: [earlier] }), [change('a')])
    expect(w).toEqual([expect.objectContaining({ kind: 'undoes', replaces: 'earlier' })])
    expect(w[0].text).toContain('"Lead with founders", 2026-10-18')
  })

  it('notes private evidence on a public page, and outside edits', () => {
    expect(regenWarnings(plan(), [change('a', { private: true })]).map((x) => x.kind)).toEqual([
      'private'
    ])
    expect(regenWarnings(plan({ pagePrivate: true }), [change('a', { private: true })])).toEqual([])
    expect(
      regenWarnings(plan({ outsideEdit: { edited: true, canDescribe: true } }), []).map(
        (x) => x.kind
      )
    ).toEqual(['outsideEdit'])
  })
})

describe('line diff', () => {
  it('marks added and removed lines and describes edits in plain words', () => {
    expect(diffLines('a\nb\nc', 'a\nB\nc')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'del', text: 'b' },
      { type: 'add', text: 'B' },
      { type: 'same', text: 'c' }
    ])
    expect(describeEdits('one\ntwo', 'one\ntwo\nthree')).toBe('Added: three')
    expect(describeEdits('same', 'same')).toBe('')
  })
})
