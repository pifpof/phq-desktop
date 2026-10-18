import { describe, expect, it, vi } from 'vitest'
import type { TreeNode, TreeSource, WikiTree } from '../../src/shared/wiki-tree'
import {
  buildArticleRows,
  parentKey,
  sectionKey,
  sourcesKey,
  type RowDeps
} from '../../src/renderer/src/features/wiki/tree-rows'

const src = (i: number): TreeSource => ({
  path: `raw/articles/s${i}.md`,
  title: `Source ${i}`,
  kind: 'citation',
  private: false,
  exists: true,
  ingested: '2026-10-17'
})

const node = (id: string, label: string, more: Partial<TreeNode> = {}): TreeNode => ({
  id,
  kind: 'article',
  slug: label.toLowerCase(),
  path: id,
  label,
  title: label,
  subtitle: '',
  summary: '',
  aliases: [],
  markers: [],
  sources: [],
  taskId: null,
  attention: false,
  children: [],
  ...more
})

const TREE: WikiTree = {
  sections: [
    {
      id: 'positioning',
      label: 'Positioning',
      count: 3,
      attention: false,
      items: [
        node('wiki/concepts/positioning-statement.md', 'Positioning Statement', {
          sources: Array.from({ length: 10 }, (_, i) => src(i))
        }),
        node('wiki/concepts/value-drivers.md', 'Value Drivers', {
          sources: [src(1)],
          children: [node('wiki/concepts/value-driver-a.md', 'Alpha')]
        }),
        node('group:moats', 'Moats', {
          kind: 'group',
          path: null,
          children: [node('missing:moat-', 'Not generated yet', { kind: 'placeholder' })]
        })
      ]
    },
    {
      id: 'customers',
      label: 'Customers',
      count: 1,
      attention: false,
      items: [node('wiki/topics/ideal-customer-profile.md', 'Ideal Customer Profile')]
    }
  ]
}

function deps(
  collapsed: string[] = [],
  open: string[] = []
): RowDeps & {
  [k: string]: unknown
} {
  return {
    collapsed: new Set(collapsed),
    open: new Set(open),
    setExpanded: vi.fn(),
    setManyExpanded: vi.fn(),
    toggleOpen: vi.fn(),
    onOpen: vi.fn()
  }
}

const labels = (d: RowDeps): string[] =>
  buildArticleRows(TREE, d).map((r) => `${r.level}:${r.label}`)

describe('article rows', () => {
  it('shows sections and parents expanded and source lists collapsed by default', () => {
    expect(labels(deps())).toEqual([
      '1:Positioning',
      '2:Positioning Statement',
      '2:Value Drivers',
      '3:Alpha',
      '2:Moats',
      '3:Not generated yet',
      '1:Customers',
      '2:Ideal Customer Profile'
    ])
  })

  it('hides what a collapsed section or parent holds', () => {
    expect(
      labels(deps([sectionKey('customers'), parentKey('wiki/concepts/value-drivers.md')]))
    ).toEqual([
      '1:Positioning',
      '2:Positioning Statement',
      '2:Value Drivers',
      '2:Moats',
      '3:Not generated yet',
      '1:Customers'
    ])
  })

  it('lists 8 sources, then Show all N; all of them once asked', () => {
    const key = sourcesKey('wiki/concepts/positioning-statement.md')
    const rows = labels(deps([sectionKey('customers')], [key]))
    expect(rows.slice(1, 11)).toEqual([
      '2:Positioning Statement',
      ...Array.from({ length: 8 }, (_, i) => `3:Source ${i}`),
      '3:Show all 10'
    ])
    const all = labels(deps([], [key, 'a:all:wiki/concepts/positioning-statement.md']))
    expect(all.filter((l) => l.startsWith('3:Source'))).toHaveLength(10)
    expect(all).not.toContain('3:Show all 10')
  })

  it('wires the controls: chevrons for children, arrows for sources, Alt for every section', () => {
    const d = deps()
    const rows = buildArticleRows(TREE, d)
    const by = (label: string) => rows.find((r) => r.label === label)!

    const vd = by('Value Drivers')
    expect([vd.chevron, vd.expanded]).toEqual([true, true])
    vd.toggle!(false)
    expect(d.setExpanded).toHaveBeenCalledWith(parentKey('wiki/concepts/value-drivers.md'), false)
    vd.secondary!()
    expect(d.toggleOpen).toHaveBeenCalledWith(sourcesKey('wiki/concepts/value-drivers.md'))
    vd.activate!()
    expect(d.onOpen).toHaveBeenCalledWith('wiki/concepts/value-drivers.md')

    // An article with sources but no children expands to its sources.
    const ps = by('Positioning Statement')
    expect([ps.chevron, ps.expanded]).toEqual([false, false])

    // A virtual parent has no article: activating it is toggling it.
    expect(by('Moats').activate).toBeUndefined()

    // A placeholder opens its Generate panel and is dimmed.
    const ph = by('Not generated yet')
    expect(ph.dim).toBe(true)
    ph.activate!()
    expect(d.onOpen).toHaveBeenCalledWith('missing:moat-')

    by('Positioning').toggle!(true)
    expect(d.setManyExpanded).toHaveBeenCalledWith(
      [sectionKey('positioning'), sectionKey('customers')],
      false
    )
  })

  it('gives every row a unique id and a parent that exists', () => {
    const rows = buildArticleRows(TREE, deps([], [sourcesKey('wiki/concepts/value-drivers.md')]))
    const ids = new Set(rows.map((r) => r.id))
    expect(ids.size).toBe(rows.length)
    for (const r of rows) if (r.parentId) expect(ids.has(r.parentId)).toBe(true)
  })
})
