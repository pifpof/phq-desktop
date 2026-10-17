import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import type { ExistingArticle } from '../../src/main/research/article-output'
import {
  applyCategoryTerms,
  assemblePlaybookText,
  demote,
  plainLinks
} from '../../src/main/research/assemble-playbook'

const GOLDEN = resolve(__dirname, '../fixtures/assemble/positioning-playbook-golden.md')

const art = (
  slug: string,
  folder: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): [string, ExistingArticle] => [
  slug,
  {
    slug,
    path: `wiki/${folder}/${slug}.md`,
    title,
    data: { title, ...data },
    body: `# ${title}\n\n> The abstract of ${title}, which the playbook leaves out.\n\n${body}\n\n## See Also\n\n- [[company-profile|Company Profile]] ([Company Profile](../references/company-profile.md))\n\n## Sources\n\n- [Acme home](../../raw/articles/2026-10-17-acme-com-home.md)\n`
  }
]

const ARTICLES = new Map<string, ExistingArticle>([
  art(
    'market-overview',
    'topics',
    'Market Overview',
    '## Why Now\n\nForecasting moved to RevOps. Ledgerly still sells to CFOs.\n\n### Shifts\n\n- AI forecasting'
  ),
  art(
    'ideal-customer-profile',
    'topics',
    'Ideal Customer Profile',
    '## ICP Formula\n\nRevOps leaders at 100 to 1,000 person SaaS companies.'
  ),
  art(
    'value-drivers',
    'concepts',
    'Value Drivers',
    '## The Three Drivers\n\n1. [[value-driver-accuracy|Accuracy]] ([Accuracy](value-driver-accuracy.md))\n2. [[value-driver-speed|Speed]] ([Speed](value-driver-speed.md))'
  ),
  art(
    'value-driver-speed',
    'concepts',
    'Speed',
    '## Challenge\n\nForecasts take two days in Sheets & Co exports.'
  ),
  art('value-driver-accuracy', 'concepts', 'Accuracy', '## Challenge\n\nMissed quarters.'),
  art(
    'moat-data',
    'concepts',
    'Pipeline Data Moat',
    '## What It Is\n\nThree years of pipeline history.'
  ),
  art(
    'positioning-statement',
    'concepts',
    'Positioning Statement',
    '## Statement\n\nUnlike Ledgerly or ledgerly inc, Acme is built for RevOps.\n\n```\nLedgerly in code stays\n```'
  ),
  art(
    'competitive-landscape',
    'topics',
    'Competitive Landscape',
    '## How to Win\n\nAgainst Ledgerly: lead with speed. See [Ledgerly pricing](https://ledgerly.io/pricing).'
  ),
  art(
    'competitor-ledgerly',
    'references',
    'Ledgerly',
    '**Category term:** legacy finance suites\n\n## Overview\n\nA suite.',
    { aliases: ['Ledgerly Inc'] }
  ),
  art('competitor-sheets', 'references', 'Sheets & Co', '## Overview\n\nNo category term here.')
])

describe('playbook assembly (no model call)', () => {
  it('matches the golden file', () => {
    const out = assemblePlaybookText(ARTICLES, { company: 'Acme', version: 2, date: '2026-10-17' })
    if (!existsSync(GOLDEN)) writeFileSync(GOLDEN, out.text)
    expect(out.text).toBe(readFileSync(GOLDEN, 'utf8'))
    expect(out.missingSections).toEqual(['Section 7: Customer Proof Points'])
    expect(out.missingTerms).toEqual(['Sheets & Co'])
    expect(out.sources).toEqual([
      'wiki/topics/market-overview.md',
      'wiki/topics/ideal-customer-profile.md',
      'wiki/concepts/value-drivers.md',
      'wiki/concepts/value-driver-accuracy.md',
      'wiki/concepts/value-driver-speed.md',
      'wiki/concepts/moat-data.md',
      'wiki/concepts/positioning-statement.md',
      'wiki/topics/competitive-landscape.md'
    ])
  })

  it('uses category terms, not competitor names, except in code and link targets', () => {
    const out = assemblePlaybookText(ARTICLES, { company: 'Acme', version: 1, date: '2026-10-17' })
    const prose = out.text.replace(/```[\s\S]*?```/g, '')
    expect(prose).not.toMatch(/Ledgerly(?! pricing\]|\.io)/)
    expect(out.text).toContain('Unlike legacy finance suites or legacy finance suites, Acme')
    expect(out.text).toContain('Ledgerly in code stays')
    expect(out.text).toContain('(https://ledgerly.io/pricing)')
    // No term for Sheets & Co: its name stays (and the note says so).
    expect(out.text).toContain('Sheets & Co exports')
  })

  it('is deterministic and keeps each section in skill-pack order', () => {
    const a = assemblePlaybookText(ARTICLES, {
      company: 'Acme',
      version: 1,
      date: '2026-10-17'
    }).text
    const b = assemblePlaybookText(new Map([...ARTICLES].reverse()), {
      company: 'Acme',
      version: 1,
      date: '2026-10-17'
    }).text
    expect(a).toBe(b)
    const order = [...a.matchAll(/^## Section (\d):/gm)].map((m) => Number(m[1]))
    expect(order).toEqual([1, 2, 3, 4, 5, 6, 7])
    // Drivers in the order the index links them.
    expect(a.indexOf('### Value Driver: Accuracy')).toBeLessThan(
      a.indexOf('### Value Driver: Speed')
    )
    expect(a).not.toContain('The abstract of')
    expect(a).not.toContain('## See Also')
    expect(a).not.toContain('[[')
  })

  it('demotes headings outside code and turns wiki links into text', () => {
    expect(demote('## A\n```\n## not\n```\n### B', 1)).toBe('### A\n```\n## not\n```\n#### B')
    expect(
      plainLinks('[[a|A]] ([A](a.md)) and [[b]] and [c](../x/c.md) and [d](https://d.com)')
    ).toBe('A and b and c and [d](https://d.com)')
    expect(
      applyCategoryTerms('Acme vs Wile. Wiley stays.', [{ names: ['Wile'], term: 'rocket makers' }])
    ).toBe('Acme vs rocket makers. Wiley stays.')
  })
})
