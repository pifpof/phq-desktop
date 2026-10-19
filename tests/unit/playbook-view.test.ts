import { describe, expect, it } from 'vitest'
import type { ExistingArticle } from '../../src/main/research/article-output'
import { assemblePlaybookText } from '../../src/main/research/assemble-playbook'
import { biggestGap, buildPlaybookView, takeLede } from '../../src/main/wiki/playbook-view'
import { checkTakeaways, readGap, readTakeaways } from '../../src/main/wiki/sections'
import type { Score } from '../../src/shared/scorecard'

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
    body: `# ${title}\n\n> Abstract.\n\n${body}\n\n## Sources\n\n- x\n`
  }
]

const TAKEAWAYS = '## Key takeaways\n\n1. One.\n2. Two.\n3. Three.\n\n'
const GAP = '## Gap to close\n\n**Problem:** No named customers.\n**Next step:** Get one quote.\n\n'

const ARTICLES = new Map<string, ExistingArticle>([
  art(
    'market-overview',
    'topics',
    'Market Overview',
    `${TAKEAWAYS}## Why Now\n\nBuyers moved to RevOps. More text here.\n\n## Shifts\n\n- AI`,
    {
      confidence: 'medium',
      updated: '2026-10-15',
      sources: ['raw/articles/a.md', 'raw/notes/b.md']
    }
  ),
  art(
    'ideal-customer-profile',
    'topics',
    'Ideal Customer Profile',
    `${TAKEAWAYS}${GAP}## ICP\n\nRevOps.`,
    {
      summary: 'RevOps leaders at mid-size SaaS.',
      confidence: 'low',
      tags: ['private']
    }
  ),
  art(
    'value-drivers',
    'concepts',
    'Value Drivers',
    '## The Drivers\n\n1. [[value-driver-speed|Speed]]\n2. [[value-driver-accuracy|Accuracy]]'
  ),
  art('value-driver-speed', 'concepts', 'Value Driver: Speed', '## Challenge\n\nSlow.', {
    summary: 'Forecasts in minutes.',
    updated: '2026-10-18'
  }),
  art('value-driver-accuracy', 'concepts', 'Accuracy', '## Challenge\n\nMisses.', {
    summary: 'Fewer missed quarters.'
  }),
  art(
    'positioning-statement',
    'concepts',
    'Positioning Statement',
    `${GAP}## Internal Positioning Statement\n\n| Field | Positioning Component |\n| :--- | :--- |\n| **For** | RevOps leaders |\n| **We** | Forecast in minutes |\n\n**Test before use:** check it.\n\n## Message Variations\n\n### Elevator Pitch\n\nAcme forecasts in minutes for RevOps.\n\n### Website\n\n- **H1:** Faster forecasts.\n\n## Rules for Use\n\nKeep it short.`
  ),
  art(
    'competitive-landscape',
    'topics',
    'Competitive Landscape',
    '## Bottom line\n\nLedgerly is slow.',
    {
      summary: 'Ledgerly leads the old guard.'
    }
  ),
  art(
    'competitor-ledgerly',
    'references',
    'Ledgerly',
    '**Category term:** legacy suites\n\n## When We Win and Lose\n\n- **Win story:** We win on speed.'
  )
])

const view = (
  articles = ARTICLES,
  o: { scores?: Score[] | null; extras?: Parameters<typeof assemblePlaybookText>[2] } = {}
) =>
  buildPlaybookView({
    path: 'output/positioning-playbook-v3-2026-10-18.md',
    text: assemblePlaybookText(
      articles,
      { company: 'Acme', version: 3, date: '2026-10-18' },
      o.extras
    ).text,
    articles,
    changes: [],
    scores: o.scores ?? null,
    current: true,
    company: 'Acme'
  })

const score = (dimension: Score['dimension'], s: number): Score => ({
  dimension,
  score: s,
  evidence: 'x'
})

describe('takeaways and gap sections (REQUIREMENTS-v4 7.1)', () => {
  it('reads exactly three takeaways and a complete gap, at either heading level', () => {
    expect(readTakeaways(TAKEAWAYS)).toEqual(['One.', 'Two.', 'Three.'])
    expect(readTakeaways(TAKEAWAYS.replace(/^## /m, '### '))).toEqual(['One.', 'Two.', 'Three.'])
    expect(readTakeaways('## Key takeaways\n\n1. One.\n2. Two.')).toBeNull()
    expect(readTakeaways('## Other\n\n1. a\n2. b\n3. c')).toBeNull()
    expect(readGap(GAP)).toEqual({ problem: 'No named customers.', nextStep: 'Get one quote.' })
    expect(readGap('## Gap to close\n\n**Problem:** Only this.')).toBeNull()
  })

  it('checks model-written takeaways', () => {
    expect(checkTakeaways(['a', 'b', 'c'], undefined)).toEqual([])
    expect(checkTakeaways(['a', 'b'], undefined)).toEqual([
      'takeaways must be exactly three lines.'
    ])
    expect(
      checkTakeaways(
        ['a', 'b', 'one two three four five six seven eight nine ten eleven twelve thirteen'],
        null
      )[0]
    ).toMatch(/more than 12 words/)
    expect(checkTakeaways(['a', 'b', 'c'], { problem: 'p' })[0]).toMatch(
      /both problem and nextStep/
    )
  })
})

describe('the playbook page model (REQUIREMENTS-v4 5, 6)', () => {
  it('splits each section into takeaways, gap, lede, body and cards', () => {
    const v = view()
    expect(v.sections.map((s) => s.id)).toEqual([
      'market',
      'customers',
      'value',
      'advantages',
      'positioning',
      'competitors',
      'proof'
    ])
    const market = v.sections[0]
    expect(market.takeaways).toEqual(['One.', 'Two.', 'Three.'])
    expect(market.gap).toBeNull()
    expect(market.lede).toBe('Buyers moved to RevOps. More text here.')
    // The heading the lede sat under is dropped, not left empty.
    expect(market.body).toBe('## Shifts\n\n- AI')
    expect(market.minutes).toBe(1)
    const value = v.sections[2]
    expect(value.cards.map((c) => [c.title, c.line, c.slug])).toEqual([
      ['Speed', 'Forecasts in minutes.', 'value-driver-speed'],
      ['Accuracy', 'Fewer missed quarters.', 'value-driver-accuracy']
    ])
    expect(value.cards[0].body).toBe('### Challenge\n\nSlow.')
    expect(v.sections[3].missing).toBe(true)
    expect(v.sections[5].cards.map((c) => [c.title, c.line])).toEqual([
      ['legacy suites', 'We win on speed.']
    ])
    expect(v.sections[6].missing).toBe(true)
  })

  it('reads the statement table and the message variations', () => {
    const s = view().sections[4]
    expect(s.gap?.problem).toBe('No named customers.')
    expect(s.statement).toEqual({
      fields: [
        ['For', 'RevOps leaders'],
        ['We', 'Forecast in minutes']
      ],
      variations: [
        { title: 'Elevator Pitch', body: 'Acme forecasts in minutes for RevOps.' },
        { title: 'Website', body: '- **H1:** Faster forecasts.' }
      ]
    })
    expect(s.after).toBe('**Test before use:** check it.\n\n## Rules for Use\n\nKeep it short.')
  })

  it('renders an older output with doubled card prefixes and no takeaways', () => {
    const old = `---\ntitle: "Positioning Playbook: Acme (v1)"\ntype: report\n---\n\n# Positioning Playbook: Acme\n\n## Section 3: Value Drivers\n\n### Intro\n\nText.\n\n### Value Driver: Value Driver: Speed\n\n#### Challenge\n\nSlow.\n`
    const v = buildPlaybookView({
      path: 'output/positioning-playbook-v1-2026-10-01.md',
      text: old,
      articles: ARTICLES,
      changes: [],
      scores: null,
      current: false,
      company: 'Acme'
    })
    const value = v.sections[2]
    expect(value.takeaways).toBeNull()
    expect(value.cards.map((c) => c.title)).toEqual(['Speed'])
    expect(value.cards[0].line).toBe('Slow.')
    expect(value.lede).toBe('Text.')
    expect(v.sections[0].missing).toBe(true)
    // Not the current version: no backfill offer.
    expect(v.needsTakeaways).toBe(false)
  })

  it('builds the section panel from the live articles', () => {
    const v = view()
    expect(v.sections[0].meta).toMatchObject({
      confidence: 'medium',
      sources: ['raw/articles/a.md', 'raw/notes/b.md'],
      lastChanged: '2026-10-15',
      article: 'wiki/topics/market-overview.md',
      pages: ['market-overview'],
      private: false,
      scoreChip: null
    })
    expect(v.sections[1].meta.private).toBe(true)
    expect(v.sections[2].meta.lastChanged).toBe('2026-10-18')
    expect(v.private).toBe(true)
    const withScores = view(ARTICLES, { scores: [score('Customer focus', 3)] })
    expect(withScores.sections[1].meta.scoreChip).toEqual({
      dimension: 'Customer focus',
      score: 3,
      max: 5
    })
    expect(withScores.sections[2].meta.scoreChip).toBeNull()
  })

  it('builds the overview from front matter, without inventing missing pieces', () => {
    const o = view().overview
    expect(o.statement).toBe('Acme forecasts in minutes for RevOps.')
    expect(o.drivers.map((d) => d.title)).toEqual(['Speed', 'Accuracy'])
    expect(o.whoFor).toBe('RevOps leaders at mid-size SaaS.')
    // Category terms, not brand names.
    expect(o.upAgainst).toBe('legacy suites leads the old guard.')
    const bare = view(new Map([...ARTICLES].filter(([k]) => k === 'market-overview')))
    expect(bare.overview).toEqual({
      statement: null,
      drivers: [],
      whoFor: null,
      upAgainst: null,
      biggestGap: null
    })
  })

  it('offers the backfill when a written section has no takeaways', () => {
    expect(view().needsTakeaways).toBe(true)
  })
})

describe('biggest gap (REQUIREMENTS-v4 6.3)', () => {
  const gap = { problem: 'p', nextStep: 'n' }
  const sections = [
    { id: 'market' as const, gap },
    { id: 'customers' as const, gap },
    { id: 'positioning' as const, gap },
    { id: 'proof' as const, gap: null }
  ]

  it('without an analysis, follows the priority order', () => {
    expect(biggestGap(sections, null)?.step).toBe('positioning')
    expect(biggestGap([{ id: 'market', gap }], null)?.step).toBe('market')
    expect(biggestGap([{ id: 'market', gap: null }], null)).toBeNull()
  })

  it('with an analysis, picks the lowest-scoring mapped dimension that has a gap', () => {
    const scores = [
      score('Clarity', 1),
      score('Differentiation', 4),
      score('Customer focus', 2),
      score('Proof', 1),
      score('Consistency', 3)
    ]
    // Proof scores lowest but has no gap; Customer focus is next.
    expect(biggestGap(sections, scores)?.step).toBe('customers')
  })
})

describe('lede', () => {
  it('takes the first paragraph before a second heading, and keeps headings with content', () => {
    expect(takeLede('First para.\n\n## A\n\nMore.')).toEqual({
      lede: 'First para.',
      rest: '## A\n\nMore.'
    })
    expect(takeLede('## A\n\nPara.\n\nSecond.\n\n## B\n\nX')).toEqual({
      lede: 'Para.',
      rest: '## A\n\nSecond.\n\n## B\n\nX'
    })
    expect(takeLede('## A\n\n| t |\n\n## B')).toEqual({ lede: '', rest: '## A\n\n| t |\n\n## B' })
  })
})
