import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { buildPlaybookView } from '../../src/main/wiki/playbook-view'
import {
  cleanPlaybookMarkdown,
  dropDuplicateHeading,
  isDuplicateHeading,
  normalizeHeading
} from '../../src/shared/headings'

const PRE_V4 = readFileSync(join(__dirname, '../fixtures/playbook/pre-v4.md'), 'utf8')

describe('heading normaliser (REQUIREMENTS-v4.4 5.1)', () => {
  it('removes emphasis, numbering, card prefixes and "for <Company>"', () => {
    expect(normalizeHeading('**Value Driver:** Faster Forecasts')).toBe('faster forecasts')
    expect(normalizeHeading('Value Driver 1: Faster Forecasts')).toBe('faster forecasts')
    expect(normalizeHeading('Value Driver: Value Driver: X')).toBe('x')
    expect(normalizeHeading('01 Faster Forecasts')).toBe('faster forecasts')
    expect(normalizeHeading('1) Faster   Forecasts')).toBe('faster forecasts')
    expect(normalizeHeading('#1 Faster Forecasts')).toBe('faster forecasts')
    expect(normalizeHeading('Moat - Built on Real Data')).toBe('built on real data')
    expect(normalizeHeading('Value Drivers for Acme', 'Acme')).toBe('value drivers')
  })

  it('matches repeats of the title and nothing else', () => {
    expect(isDuplicateHeading('Value Drivers', 'Value Drivers')).toBe(true)
    expect(isDuplicateHeading('Value Drivers for Acme', 'Value Drivers')).toBe(true)
    expect(isDuplicateHeading('Value Driver 1: X', 'X')).toBe(true)
    expect(isDuplicateHeading('01 Faster Forecasts', 'Faster Forecasts')).toBe(true)
    expect(isDuplicateHeading('How we measured it', 'Value Drivers')).toBe(false)
    expect(isDuplicateHeading('Cost', 'Lower Total Cost Per Seat')).toBe(false)
    expect(isDuplicateHeading('Customer Challenge', 'Faster Forecasts')).toBe(false)
  })

  it('drops only a first heading that repeats the title, keeping a lede before it', () => {
    expect(dropDuplicateHeading('Lede.\n\n## Value Driver: X\n\nBody.', 'X')).toBe('Lede.\n\nBody.')
    expect(dropDuplicateHeading('## Other\n\n## X\n\nBody.', 'X')).toBe('## Other\n\n## X\n\nBody.')
    expect(dropDuplicateHeading('```\n# X\n```', 'X')).toBe('```\n# X\n```')
  })
})

describe('a pre-v4 playbook renders without duplicates (REQUIREMENTS-v4.4 5.2)', () => {
  const v = buildPlaybookView({
    path: 'output/positioning-playbook-v4-2026-10-19.md',
    text: PRE_V4,
    articles: new Map(),
    changes: [],
    scores: null,
    current: false,
    company: 'Acme'
  })
  const step = (id: string) => v.sections.find((s) => s.id === id)!

  it('cards show their title once', () => {
    const value = step('value')
    expect(value.cards.map((c) => c.title)).toEqual([
      'Faster Forecasts',
      'Lower Total Cost Per Seat'
    ])
    expect(value.cards[0].body).not.toMatch(/Value Driver/)
    expect(value.cards[0].body).toMatch(/Customer Challenge/)
    // a heading that only shares a word stays
    expect(value.cards[1].body).toMatch(/Cost/)
    expect(step('competitors').cards[0].body).not.toMatch(/^#+ .*legacy suites/m)
  })

  it('a section drops a heading that repeats its title, and keeps one that differs', () => {
    expect(step('value').body + step('value').lede).not.toMatch(/Value Drivers for Acme/)
    expect(step('value').body).toMatch(/How we measured it/)
    expect(step('market').body + step('market').lede).not.toMatch(/Market Overview for Acme/)
  })

  it('Copy as markdown matches the page', () => {
    const md = cleanPlaybookMarkdown(PRE_V4, 'Acme')
    expect(md).not.toMatch(/Value Driver: Value Driver/)
    expect(md).not.toMatch(/^#### Value Driver: Faster Forecasts/m)
    expect(md).not.toMatch(/^#### 01\. Built on Real Data/m)
    expect(md).toMatch(/^### Value Driver: Faster Forecasts$/m)
    expect(md).toMatch(/^#### Cost$/m)
    expect(md).toMatch(/^### How we measured it$/m)
  })
})

describe('assembly drops a body heading that repeats the article title', () => {
  it('as in the value driver articles: H1, abstract, then the title again as H2', async () => {
    const { assemblePlaybookText } = await import('../../src/main/research/assemble-playbook')
    const title = 'Value Driver: Employee Enablement'
    const articles = new Map([
      [
        'value-driver-employee-enablement',
        {
          slug: 'value-driver-employee-enablement',
          path: 'wiki/concepts/value-driver-employee-enablement.md',
          title,
          data: { title, summary: 'Give people time to learn.' },
          body: `# ${title}\n\n> Abstract.\n\n## ${title}\n\n### 1. Customer Challenge\n\nNo talent.\n\n## Sources\n\n- x\n`
        }
      ]
    ])
    const text = assemblePlaybookText(articles, {
      company: 'Acme',
      version: 1,
      date: '2026-10-21'
    }).text
    expect(text.match(/Employee Enablement/g)?.length).toBe(1)
    expect(text).toMatch(/^### Value Driver: Employee Enablement$/m)
    expect(text).toMatch(/Customer Challenge/)
  })
})
