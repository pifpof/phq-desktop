import { describe, expect, it, vi } from 'vitest'
import type { SourceNode, SourcesTree, TreeNode, WikiTree } from '../../src/shared/wiki-tree'
import {
  buildArticleRows,
  buildSourceRows,
  isExpanded,
  matches,
  parentKey,
  sectionKey,
  sourceGroupKey,
  sourceSectionKey,
  type RowDeps
} from '../../src/renderer/src/features/wiki/tree-rows'

const node = (id: string, label: string, more: Partial<TreeNode> = {}): TreeNode => ({
  id,
  kind: 'article',
  slug: label.toLowerCase(),
  path: id,
  label,
  title: label,
  subtitle: '',
  summary: '',
  help: '',
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
      help: '',
      count: 3,
      attention: false,
      items: [
        node('wiki/concepts/positioning-statement.md', 'Positioning Statement'),
        node('wiki/concepts/value-drivers.md', 'Value Drivers', {
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
      id: 'competitors',
      label: 'Competitors',
      help: '',
      count: 2,
      attention: false,
      items: [
        node('wiki/topics/competitive-landscape.md', 'Competitive Landscape'),
        node('group:competitor-profiles', 'Competitor Profiles', {
          kind: 'group',
          path: null,
          children: [
            node('wiki/references/competitor-acme.md', 'Acme', { aliases: ['Acme Corp', 'ACM'] }),
            node('wiki/references/competitor-zed.md', 'Zed')
          ]
        })
      ]
    }
  ]
}

function deps(collapsed: string[] = [], open: string[] = []): RowDeps {
  return {
    collapsed: new Set(collapsed),
    open: new Set(open),
    setManyExpanded: vi.fn(),
    onOpen: vi.fn()
  }
}

const labels = (rows: { level: number; label: string }[]): string[] =>
  rows.map((r) => `${r.level}:${r.label}`)

describe('article rows', () => {
  it('starts with every section heading collapsed', () => {
    expect(labels(buildArticleRows(TREE, deps()))).toEqual(['1:Positioning', '1:Competitors'])
    expect(isExpanded(sectionKey('positioning'), new Set(), new Set())).toBe(false)
    expect(isExpanded(parentKey('x'), new Set(), new Set())).toBe(true)
  })

  it('shows an opened section with its parents expanded, unless collapsed', () => {
    expect(labels(buildArticleRows(TREE, deps([], [sectionKey('positioning')])))).toEqual([
      '1:Positioning',
      '2:Positioning Statement',
      '2:Value Drivers',
      '3:Alpha',
      '2:Moats',
      '3:Not generated yet',
      '1:Competitors'
    ])
    expect(
      labels(
        buildArticleRows(
          TREE,
          deps([parentKey('wiki/concepts/value-drivers.md')], [sectionKey('positioning')])
        )
      ).slice(0, 4)
    ).toEqual(['1:Positioning', '2:Positioning Statement', '2:Value Drivers', '2:Moats'])
  })

  it('wires the controls: chevrons for children, Alt for every section', () => {
    const d = deps([], [sectionKey('positioning')])
    const rows = buildArticleRows(TREE, d)
    const by = (label: string) => rows.find((r) => r.label === label)!

    const vd = by('Value Drivers')
    expect(vd.expanded).toBe(true)
    vd.toggle!(false)
    expect(d.setManyExpanded).toHaveBeenCalledWith(
      [parentKey('wiki/concepts/value-drivers.md')],
      false
    )
    vd.activate!()
    expect(d.onOpen).toHaveBeenCalledWith('wiki/concepts/value-drivers.md')

    // No sources in the tree: an article without children doesn't expand.
    expect(by('Positioning Statement').expanded).toBeUndefined()
    // A virtual parent has no article: activating it is toggling it.
    expect(by('Moats').activate).toBeUndefined()
    const ph = by('Not generated yet')
    expect(ph.dim).toBe(true)
    ph.activate!()
    expect(d.onOpen).toHaveBeenCalledWith('missing:moat-')

    by('Competitors').toggle!(true)
    expect(d.setManyExpanded).toHaveBeenCalledWith(
      [sectionKey('positioning'), sectionKey('competitors')],
      true
    )
  })

  it('searches labels, titles, aliases and summaries, opening what matches without saving it', () => {
    const d = deps()
    const rows = buildArticleRows(TREE, d, 'acme corp')
    expect(labels(rows)).toEqual(['1:Competitors', '2:Competitor Profiles', '3:Acme'])
    expect(rows[0]).toMatchObject({ count: 1, total: 2, expanded: true })
    expect(d.setManyExpanded).not.toHaveBeenCalled()
    // Cleared: back to the saved state.
    expect(labels(buildArticleRows(TREE, d, ''))).toEqual(['1:Positioning', '1:Competitors'])
    // Placeholders never match.
    expect(buildArticleRows(TREE, d, 'generated')).toEqual([])
    expect(matches('ICP', 'Ideal Customer Profile', ['ICP'])).toBe(true)
  })

  it('gives every row a unique id and a parent that exists', () => {
    const rows = buildArticleRows(
      TREE,
      deps([], [sectionKey('positioning'), sectionKey('competitors')])
    )
    const ids = new Set(rows.map((r) => r.id))
    expect(ids.size).toBe(rows.length)
    for (const r of rows) if (r.parentId) expect(ids.has(r.parentId)).toBe(true)
  })
})

const source = (path: string, title: string, citedBy: string[] = []): SourceNode => ({
  path,
  title,
  kind: 'citation',
  private: false,
  exists: true,
  ingested: '2026-10-17',
  summary: '',
  citedBy: citedBy.map((c) => ({ path: c, label: c }))
})

const SOURCES: SourcesTree = {
  sections: [
    {
      id: 'files',
      label: 'Your files',
      help: '',
      count: 1,
      sources: [],
      groups: [
        { id: 'roadmap', label: 'Roadmap', sources: [source('raw/papers/r.md', 'Roadmap 2027')] }
      ]
    },
    {
      id: 'citations',
      label: 'Web citations',
      help: '',
      count: 2,
      sources: [
        source('raw/articles/a.md', 'Analyst note', ['wiki/topics/market-overview.md']),
        source('raw/articles/b.md', 'Blog post')
      ],
      groups: []
    }
  ]
}

describe('source rows', () => {
  it('starts collapsed; Your files leads with Add files, then its category groups', () => {
    expect(labels(buildSourceRows(SOURCES, deps()))).toEqual(['1:Your files', '1:Web citations'])
    const rows = buildSourceRows(SOURCES, deps([], [sourceSectionKey('files')]))
    expect(labels(rows)).toEqual([
      '1:Your files',
      '2:Add files',
      '2:Roadmap',
      '3:Roadmap 2027',
      '1:Web citations'
    ])
    expect(rows.find((r) => r.type === 'add')?.id).toBe('files')
    const collapsedGroup = buildSourceRows(
      SOURCES,
      deps([sourceGroupKey('files', 'roadmap')], [sourceSectionKey('files')])
    )
    expect(labels(collapsedGroup)).not.toContain('3:Roadmap 2027')
  })

  it('searches source titles and keeps uncited ones visible as such', () => {
    const rows = buildSourceRows(SOURCES, deps(), 'blog')
    expect(labels(rows)).toEqual(['1:Web citations', '2:Blog post'])
    const blog = rows[1]
    expect(blog.type === 'source' && blog.source.citedBy).toEqual([])
  })
})

describe('performance', () => {
  it('lays out 200 articles and 1,000 sources, all expanded, in well under 100 ms', () => {
    const big: WikiTree = {
      sections: [
        {
          id: 'competitors',
          label: 'Competitors',
          help: '',
          count: 200,
          attention: false,
          items: [
            node('group:competitor-profiles', 'Competitor Profiles', {
              kind: 'group',
              path: null,
              children: Array.from({ length: 200 }, (_, i) =>
                node(`wiki/references/competitor-c${i}.md`, `Competitor ${i}`)
              )
            })
          ]
        }
      ]
    }
    const many: SourcesTree = {
      sections: [
        {
          id: 'citations',
          label: 'Web citations',
          help: '',
          count: 1000,
          sources: Array.from({ length: 1000 }, (_, i) =>
            source(`raw/articles/s${i}.md`, `Source ${i}`, [`wiki/topics/t${i % 50}.md`])
          ),
          groups: []
        }
      ]
    }
    const d = deps([], [sectionKey('competitors'), sourceSectionKey('citations')])
    const t0 = performance.now()
    const a = buildArticleRows(big, d)
    const s = buildSourceRows(many, d)
    buildArticleRows(big, d, 'competitor 1')
    const ms = performance.now() - t0
    expect(a).toHaveLength(202)
    expect(s).toHaveLength(1001)
    expect(ms).toBeLessThan(50)
  })
})
