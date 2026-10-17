import { checkScorecard } from '@shared/scorecard'
import { checkSocialTable } from '@shared/social'
import { safeName } from '../workspace/safe-name'
import { slugify } from '../wiki/paths'
import type { TaskContext, TaskDef, WebTools } from './types'

/** The research pipeline as data (REQUIREMENTS-v1 3.1). Add or re-run tasks by editing this list. */

const search = (
  maxUses: number,
  fetch?: { maxUses: number; maxContentTokens: number }
): WebTools => ({
  search: { maxUses },
  ...(fetch ? { fetch } : {})
})
const FETCH = { maxUses: 3, maxContentTokens: 20_000 }

/** Where an article or output task leaves the list of what it wrote (in the run's drafts). */
export const receipt = (id: string): string =>
  `memory/receipts/${id.replace(/[^a-z0-9-]+/gi, '-')}.md`

/** An AI task that writes wiki articles (REQUIREMENTS-v2 3.3). */
const articles = (
  allowed: string[],
  required = allowed,
  patches?: string[]
): TaskDef['writes'] => ({
  kind: 'articles',
  targets: { allowed, required, ...(patches ? { patches } : {}) }
})

const companyResearchStep = (n: string, slug: string, title: string, article: string): TaskDef => ({
  id: `research-${n}-${slug}`,
  title,
  stage: 1,
  kind: 'web-research',
  dependsOn: [],
  skill: 'company-research',
  rules: ['references/format-rules.md'],
  asset: `assets/${n}-${slug === 'product' ? 'product-analysis' : slug}.md`,
  instruction: `Research this step on the web, then write the ${article} article.`,
  inputs: { outputs: [], inputCategories: [] },
  web: search(5, FETCH),
  writes: articles([article]),
  output: () => receipt(`research-${n}-${slug}`)
})

const playbookSection = (
  n: string,
  slug: string,
  title: string,
  dependsOn: string[],
  outputs: string[],
  inputCategories: NonNullable<TaskDef['inputs']>['inputCategories'],
  writes: TaskDef['writes'],
  extra = ''
): TaskDef => ({
  id: `playbook-${n}-${slug}`,
  title,
  stage: 4,
  kind: 'playbook-section',
  dependsOn: [...dependsOn, ...(inputCategories.length ? ['extract-input-files'] : [])],
  skill: 'positioning-playbook',
  rules: ['references/tone-style.md'],
  asset: `assets/${n}-${slugFile[slug]}.md`,
  instruction: `Write the wiki articles for Section ${Number(n)} of the playbook (${SECTION_TITLES[n]}), using only the documents provided.${extra}`,
  inputs: { outputs, inputCategories },
  web: false,
  cacheDocuments: true,
  writes,
  output: () => receipt(`playbook-${n}-${slug}`)
})

/** Section titles from the skill pack, used as fixed headings so the playbook assembles cleanly. */
export const SECTION_TITLES: Record<string, string> = {
  '01': 'Market Overview',
  '02': 'Target Customers',
  '03': 'Value Drivers',
  '04': 'Distinct Advantages',
  '05': 'Positioning Statement',
  '06': 'Competitive Intelligence',
  '07': 'Customer Proof Points'
}

const slugFile: Record<string, string> = {
  market: 'market-overview',
  icp: 'target-customers',
  value: 'value-drivers',
  moat: 'distinct-advantages',
  statement: 'positioning-statement',
  competitive: 'competitive-intelligence',
  proof: 'customer-proof-points'
}

export interface Competitor {
  name: string
  website: string
  type: string
}

const cellsOf = (line: string): string[] =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim().replace(/[*_`]/g, ''))

/**
 * Reads the competitor table: the first table whose header has a Name column and a Website column.
 * Any other table in the document (pricing, features) is ignored.
 */
export function parseCompetitors(markdown: string): Competitor[] {
  const lines = markdown.split('\n')
  const out: Competitor[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith('|')) continue
    const header = cellsOf(lines[i]).map((c) => c.toLowerCase())
    const nameCol = header.findIndex((c) => /^(name|competitor|company|alternative)$/.test(c))
    const siteCol = header.findIndex((c) => /^(website|site|url|domain)$/.test(c))
    const typeCol = header.findIndex((c) => /^type$/.test(c))
    if (nameCol < 0 || siteCol < 0) continue
    for (let j = i + 1; j < lines.length && lines[j].trim().startsWith('|'); j++) {
      const cells = cellsOf(lines[j])
      if (cells.every((c) => /^[-: ]*$/.test(c))) continue
      const name = (cells[nameCol] ?? '').replace(/[[\]]/g, '').trim()
      const rawSite = cells[siteCol] ?? ''
      const website =
        /https?:\/\/[^\s)|]+/i.exec(rawSite)?.[0] ??
        /(?:[a-z0-9-]+\.)+[a-z]{2,}[^\s)|\]]*/i.exec(rawSite)?.[0] ??
        (/^n\/?a$/i.test(rawSite) ? 'n/a' : '')
      const type = typeCol >= 0 ? (cells[typeCol] ?? '') : ''
      if (name && !out.some((c) => c.name.toLowerCase() === name.toLowerCase()))
        out.push({ name, website, type })
    }
    break
  }
  return out.slice(0, 6)
}

const isStatusQuo = (c: Competitor): boolean =>
  /status quo|do nothing|doing nothing/i.test(c.type) || /^n\/?a$/i.test(c.website)

/** The companies to profile: discovery's table without the status quo (there is no company to research), at most five. */
async function competitorsFor(ctx: TaskContext): Promise<Competitor[]> {
  const found = parseCompetitors((await ctx.readOutput('competitor-discovery')) ?? '').filter(
    (c) => !isStatusQuo(c)
  )
  if (found.length) return found.slice(0, 5)
  // Discovery gave nothing usable: fall back to the names the user typed.
  return ctx.profile.company.competitors
    .slice(0, 5)
    .map((name) => ({ name, website: '', type: 'Direct' }))
}

const competitorProfile = (c: Competitor): TaskDef => ({
  id: `competitor-profiles:${safeName(c.name).toLowerCase().replace(/\s+/g, '-')}`,
  competitor: {
    slug: slugify(c.name, 'competitor'),
    website: c.website === 'n/a' ? '' : c.website
  },
  writes: articles([`competitor-${slugify(c.name, 'competitor')}`]),
  title: `Profile: ${c.name}`,
  stage: 2,
  kind: 'web-profile',
  dependsOn: ['competitor-discovery'],
  skill: 'competitor-profile',
  rules: ['references/rules.md'],
  asset: 'assets/competitor-profile.md',
  instruction: `Profile this competitor: ${c.name}${c.website ? ` (${c.website})` : ''}. Research it on the web, then write its article, competitor-${slugify(c.name, 'competitor')}. Put its other names in aliases and give the generic term for this kind of competitor in category_term.`,
  inputs: { outputs: ['competitor-discovery'], inputCategories: [] },
  web: search(6, { maxUses: 4, maxContentTokens: 20_000 }),
  output: () =>
    receipt(`competitor-profiles:${safeName(c.name).toLowerCase().replace(/\s+/g, '-')}`)
})

export const TASKS: TaskDef[] = [
  // Stage 1: start immediately, in parallel
  {
    id: 'crawl-website',
    title: 'Read your website',
    stage: 1,
    kind: 'local',
    dependsOn: [],
    local: 'crawl',
    web: false,
    output: () => 'memory/research/website/index.md'
  },
  {
    id: 'extract-input-files',
    title: 'Read your files',
    stage: 1,
    kind: 'local',
    dependsOn: [],
    local: 'extract',
    web: false,
    output: () => 'memory/research/inputs-extracted/index.md'
  },
  {
    id: 'find-social-profiles',
    title: 'Find social profiles',
    stage: 1,
    kind: 'web-research',
    // Waits for the crawl (seconds) so links from the company's own site are used first.
    dependsOn: ['crawl-website'],
    skill: 'social-taglines',
    rules: ['references/rules.md'],
    asset: 'assets/social-profiles.md',
    instruction:
      'List the company social profiles now. Use the links in the crawl index first, then search for the rest.',
    inputs: { outputs: ['crawl-website'], inputCategories: [] },
    web: search(6),
    output: () => 'memory/research/social-profiles.md'
  },
  companyResearchStep('02', 'product', 'Product and service analysis', 'product-overview'),
  companyResearchStep('03', 'market-segment', 'Market segment', 'market-segment'),
  companyResearchStep('04', 'customer-segment', 'Customer segment', 'customer-segment'),
  companyResearchStep('05', 'strengths', 'Strengths', 'strengths'),
  companyResearchStep('06', 'weaknesses', 'Weaknesses', 'weaknesses'),
  companyResearchStep('07', 'recent-developments', 'Recent developments', 'recent-developments'),
  {
    id: 'competitor-discovery',
    title: 'Find competitors',
    stage: 1,
    kind: 'web-research',
    dependsOn: [],
    skill: 'competitor-discovery',
    rules: ['references/rules.md'],
    asset: 'assets/competitors.md',
    instruction:
      'Confirm or find the 3 to 5 most relevant competitors now. Output the table exactly as specified.',
    inputs: { outputs: [], inputCategories: [] },
    web: search(6),
    output: () => 'memory/research/competitors.md'
  },

  // Stage 2
  {
    id: 'website-positioning',
    title: 'Analyse your website positioning',
    stage: 2,
    kind: 'synthesis',
    dependsOn: ['crawl-website'],
    skill: 'website-positioning',
    rules: ['references/rules.md'],
    asset: 'assets/website-positioning.md',
    instruction:
      'Write the current-messaging article: how the company positions itself today, from the crawled pages provided.',
    inputs: { outputs: ['crawl-website'], inputCategories: [] },
    web: false,
    cacheDocuments: true,
    writes: articles(['current-messaging']),
    output: () => receipt('website-positioning')
  },
  {
    id: 'research-01-overview',
    title: 'Company overview',
    stage: 2,
    kind: 'synthesis',
    dependsOn: ['crawl-website', 'website-positioning'],
    skill: 'company-research',
    rules: ['references/format-rules.md'],
    asset: 'assets/01-company-overview.md',
    instruction:
      'Write the company-overview article from the documents provided. They include the crawl of the company website.',
    inputs: { outputs: ['crawl-website', 'website-positioning'], inputCategories: [] },
    web: false,
    cacheDocuments: true,
    writes: articles(['company-overview']),
    output: () => receipt('research-01-overview')
  },
  {
    id: 'social-taglines',
    title: 'Collect social taglines',
    stage: 2,
    kind: 'web-profile',
    dependsOn: ['find-social-profiles'],
    skill: 'social-taglines',
    rules: ['references/rules.md'],
    asset: 'assets/social-taglines.md',
    instruction:
      'Collect the tagline or bio of every profile in the social profiles list, then write the social-taglines article with the table. Mark any profile you cannot read as Not found.',
    inputs: { outputs: ['find-social-profiles', 'crawl-website'], inputCategories: [] },
    web: search(6, { maxUses: 6, maxContentTokens: 10_000 }),
    validate: checkSocialTable,
    writes: {
      kind: 'articles',
      targets: { allowed: ['social-taglines'], required: ['social-taglines'] },
      socialNotes: true
    },
    output: () => receipt('social-taglines')
  },
  {
    id: 'competitor-profiles',
    title: 'Profile competitors',
    stage: 2,
    kind: 'local',
    dependsOn: ['competitor-discovery'],
    web: false,
    output: () => 'memory/receipts/competitor-profiles',
    fanOut: async (ctx) => (await competitorsFor(ctx)).map(competitorProfile)
  },
  {
    id: 'proof-gathering',
    title: 'Gather reviews and public proof',
    stage: 2,
    kind: 'web-profile',
    dependsOn: ['competitor-discovery'],
    skill: 'proof-gathering',
    rules: ['references/rules.md'],
    asset: 'assets/proof-public.md',
    instruction: 'Search for public proof about the company now and write the document.',
    inputs: { outputs: [], inputCategories: [] },
    web: search(8, { maxUses: 4, maxContentTokens: 15_000 }),
    output: () => 'memory/research/proof-public.md'
  },

  // Stage 3
  {
    id: 'research-08-competitive',
    title: 'Competitive analysis',
    stage: 3,
    kind: 'synthesis-large',
    dependsOn: ['competitor-profiles', 'extract-input-files'],
    skill: 'company-research',
    rules: ['references/format-rules.md'],
    asset: 'assets/08-competitive-analysis.md',
    instruction:
      "Write the competitive analysis for the single most direct competitor, chosen from the articles provided. Add it to that competitor's article as a patch: one ## section per part of the template, keeping the template's headings.",
    inputs: {
      outputs: ['competitor-profiles', 'competitor-discovery'],
      inputCategories: ['competitive-intel']
    },
    web: false,
    cacheDocuments: true,
    writes: articles([], [], ['competitor-*']),
    output: () => receipt('research-08-competitive')
  },
  {
    id: 'research-09-synthesis',
    title: 'Market overview',
    stage: 3,
    kind: 'synthesis-large',
    dependsOn: [
      'research-02-product',
      'research-03-market-segment',
      'research-04-customer-segment',
      'research-05-strengths',
      'research-06-weaknesses',
      'research-07-recent-developments',
      'research-01-overview',
      'research-08-competitive',
      'extract-input-files'
    ],
    skill: 'company-research',
    rules: ['references/format-rules.md'],
    asset: 'assets/09-synthesis.md',
    instruction:
      'Synthesise the articles provided into the market-position-summary article (the Market Overview of the company research).',
    inputs: {
      outputs: [
        'research-01-overview',
        'research-02-product',
        'research-03-market-segment',
        'research-04-customer-segment',
        'research-05-strengths',
        'research-06-weaknesses',
        'research-07-recent-developments',
        'research-08-competitive'
      ],
      inputCategories: ['company strategy']
    },
    web: false,
    cacheDocuments: true,
    writes: articles(['market-position-summary']),
    output: () => receipt('research-09-synthesis')
  },

  // Stage 4: the playbook
  playbookSection(
    '01',
    'market',
    'Playbook: market overview',
    ['research-09-synthesis'],
    ['research-09-synthesis', 'website-positioning'],
    ['company strategy', 'sales collateral'],
    articles(['market-overview'])
  ),
  playbookSection(
    '02',
    'icp',
    'Playbook: target customers',
    ['research-09-synthesis'],
    ['research-09-synthesis', 'website-positioning'],
    ['sales collateral', 'customer references', 'company strategy'],
    articles(['ideal-customer-profile'])
  ),
  playbookSection(
    '06',
    'competitive',
    'Playbook: competitive intelligence',
    ['competitor-profiles', 'research-08-competitive'],
    ['competitor-profiles', 'research-08-competitive'],
    ['competitive-intel', 'sales collateral'],
    articles(['competitive-landscape'], ['competitive-landscape'], ['competitor-*']),
    ' Write competitive-landscape. Then add two sections to each competitor\'s article as patches: "## SWOT Relative to Us" and "## When We Win and Lose" (with any win stories from the documents).'
  ),
  playbookSection(
    '07',
    'proof',
    'Playbook: customer proof points',
    ['proof-gathering'],
    ['proof-gathering'],
    ['customer references'],
    articles(['proof-points'])
  ),
  playbookSection(
    '03',
    'value',
    'Playbook: value drivers',
    ['playbook-02-icp'],
    ['playbook-02-icp', 'research-09-synthesis'],
    ['sales collateral', 'help-docs', 'customer references'],
    articles(['value-drivers', 'value-driver-*']),
    ' Write value-drivers as a short index (the three drivers, one line each, linking to each) and one value-driver-<x> article per driver, three in all.'
  ),
  playbookSection(
    '04',
    'moat',
    'Playbook: distinct advantages',
    ['playbook-03-value'],
    ['playbook-03-value', 'playbook-02-icp', 'research-09-synthesis'],
    ['roadmap', 'company strategy', 'competitive-intel'],
    articles(['moat-*']),
    ' Write one moat-<x> article per distinct advantage, two or three in all.'
  ),
  playbookSection(
    '05',
    'statement',
    'Playbook: positioning statement',
    [
      'playbook-01-market',
      'playbook-02-icp',
      'playbook-03-value',
      'playbook-04-moat',
      'playbook-06-competitive'
    ],
    [
      'playbook-01-market',
      'playbook-02-icp',
      'playbook-03-value',
      'playbook-04-moat',
      'playbook-06-competitive'
    ],
    ['company strategy'],
    articles(['positioning-statement'])
  ),
  {
    id: 'playbook-assemble',
    title: 'Publish the playbook',
    stage: 4,
    kind: 'local',
    dependsOn: [
      'playbook-01-market',
      'playbook-02-icp',
      'playbook-03-value',
      'playbook-04-moat',
      'playbook-05-statement',
      'playbook-06-competitive',
      'playbook-07-proof'
    ],
    local: 'assemble-playbook',
    web: false,
    output: () => receipt('playbook-assemble')
  },

  // Stage 5
  {
    id: 'messaging-analysis',
    title: 'Analyse your messaging',
    stage: 5,
    kind: 'messaging-analysis',
    dependsOn: [
      'website-positioning',
      'social-taglines',
      'playbook-assemble',
      'extract-input-files'
    ],
    skill: 'messaging-analysis',
    rules: ['references/rules.md', 'references/scoring-rubric.md'],
    asset: 'assets/messaging-analysis.md',
    instruction:
      'Write the messaging analysis now. Start with the scorecard JSON block. Order the five fixes by the goals in the company profile.',
    validate: checkScorecard,
    inputs: {
      outputs: [
        'website-positioning',
        'social-taglines',
        'playbook-05-statement',
        'playbook-02-icp',
        'playbook-03-value',
        'playbook-04-moat',
        'playbook-06-competitive'
      ],
      inputCategories: ['sales collateral']
    },
    web: false,
    cacheDocuments: true,
    writes: { kind: 'output', name: 'messaging-analysis', title: 'Messaging Analysis' },
    output: () => receipt('messaging-analysis')
  }
]

export const taskById = (id: string): TaskDef | undefined => TASKS.find((t) => t.id === id)
