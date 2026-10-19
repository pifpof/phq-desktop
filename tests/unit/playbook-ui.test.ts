import { describe, expect, it } from 'vitest'
import { onlySources, type SourcesTree } from '../../src/shared/wiki-tree'
import { playbookStepFor } from '../../src/shared/wiki-views'
import { defaultPageSize, readPrintOptions } from '../../src/shared/playbook'

const node = (path: string) => ({ path }) as SourcesTree['sections'][number]['sources'][number]

describe('playbook links into the wiki (REQUIREMENTS-v4 4.1, 6.2)', () => {
  it('filters the Sources tree to a section’s sources, keeping sections and groups', () => {
    const tree: SourcesTree = {
      sections: [
        {
          id: 'web',
          label: 'Web',
          help: '',
          count: 2,
          sources: [node('raw/a.md'), node('raw/b.md')],
          groups: []
        },
        {
          id: 'files',
          label: 'Files',
          help: '',
          count: 2,
          sources: [],
          groups: [
            { id: 'notes', label: 'Notes', sources: [node('raw/c.md')] },
            { id: 'decks', label: 'Decks', sources: [node('raw/d.md')] }
          ]
        }
      ]
    }
    const only = onlySources(tree, new Set(['raw/b.md', 'raw/d.md']))
    expect(only.sections.map((s) => [s.id, s.count])).toEqual([
      ['web', 1],
      ['files', 1]
    ])
    expect(only.sections[1].groups.map((g) => g.id)).toEqual(['decks'])
    expect(onlySources(tree, new Set()).sections).toEqual([])
  })

  it('maps section articles to their playbook step', () => {
    expect(playbookStepFor('ideal-customer-profile')).toBe(2)
    expect(playbookStepFor('value-driver-speed')).toBe(3)
    expect(playbookStepFor('moat-data')).toBe(4)
    expect(playbookStepFor('competitor-acme')).toBeNull()
    expect(playbookStepFor('company-overview')).toBeNull()
  })
})

describe('Export PDF helpers (REQUIREMENTS-v4 8)', () => {
  it('reads the print options from the print view URL, and nothing else', () => {
    const o = {
      path: 'output/positioning-playbook-v3-2026-10-19.md',
      pageSize: 'A4',
      includeGaps: true,
      includePrivate: false
    }
    expect(readPrintOptions(`#print=${encodeURIComponent(JSON.stringify(o))}`)).toEqual(o)
    expect(readPrintOptions('')).toBeNull()
    expect(readPrintOptions('#print=not-json')).toBeNull()
    expect(readPrintOptions(`#print=${encodeURIComponent('{"pageSize":"A3"}')}`)).toBeNull()
  })

  it('picks Letter for North America, A4 elsewhere', () => {
    expect(defaultPageSize('en-US')).toBe('Letter')
    expect(defaultPageSize('en-CA')).toBe('Letter')
    expect(defaultPageSize('en-GB')).toBe('A4')
    expect(defaultPageSize('de')).toBe('A4')
  })
})
