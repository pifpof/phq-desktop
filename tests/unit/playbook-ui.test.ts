import { describe, expect, it } from 'vitest'
import { onlySources, type SourcesTree } from '../../src/shared/wiki-tree'
import { playbookStepFor } from '../../src/shared/wiki-views'

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
