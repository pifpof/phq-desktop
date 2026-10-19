import type { StepId } from '@shared/playbook'
import type { SCORE_DIMENSIONS } from '@shared/scorecard'
import type { Category, Volatility } from '@shared/wiki-types'
import type { NavSection, VirtualParent } from '@shared/wiki-tree'
import { articleRel } from './paths'

/**
 * Spec section 6 as data: every fixed slug and slug pattern, with its category, default
 * volatility, the skill-pack asset used as its section template, and the task that writes it.
 * The slugs are a public contract shared with the skill pack. Change them only with the spec.
 */

/** Groups for the Knowledge tab (REQUIREMENTS-v2 4.1), in display order. */
export const ARTICLE_GROUPS = [
  'Company',
  'Market',
  'Customers',
  'Positioning',
  'Competitors',
  'Proof',
  'Messaging',
  'Decisions'
] as const
export type ArticleGroup = (typeof ARTICLE_GROUPS)[number]

export interface ArticleSpec {
  /** The fixed slug, or the prefix of a pattern slug ("competitor-"). */
  slug: string
  pattern: boolean
  category: Category
  volatility: Volatility
  /** Title for a fixed slug. Pattern articles take their title from the content. */
  title: string
  aliases: string[]
  group: ArticleGroup
  /** Skill-pack asset (under resources/skills/) used as the section template. */
  template: string | null
  /** v1 task ID that writes it, or "app" for articles the app writes without a model. */
  task: string
  /** Wiki pane placement (REQUIREMENTS-v3 3.1, 5). */
  navSection: NavSection
  /** Order within the section, or within the parent for children. */
  navOrder: number
  /** Short label in the tree. Empty for patterns, which use their title. */
  navLabel: string
  /** A real parent's slug or a virtual parent's id. */
  navParent: string | null
  /** Title prefix dropped in the tree ("Value Driver" for "Value Driver: Faster Ramp"). */
  labelPrefix: string | null
  /** Slugs (or "prefix*" patterns) of the articles that feed this one, for "Out of date". */
  dependsOn: string[]
  /** Smaller line under the label. */
  navSubtitle: string
  /** What the article is for, in plain words, for the tree's tooltip. */
  navHelp: string
}

/** Tooltip help, by nav label (fixed slugs) or label prefix (patterns). No em dashes. */
const HELP: Record<string, string> = {
  'Positioning Statement':
    'The core answer: who you serve, the problem you solve, and why you win. Everything else supports it.',
  'Value Drivers':
    'The outcomes customers buy from you, each backed by evidence. Open one to see the detail.',
  'Value Driver': 'One outcome customers buy from you, and the evidence behind it.',
  Moat: 'An advantage competitors would find hard to copy, and why.',
  'Proof Points': 'Evidence for your claims: results, quotes and named customers.',
  Decision: 'A positioning choice you recorded. Research follows it.',
  'Ideal Customer Profile':
    'The customer you win most often and serve best, and how to recognise them.',
  'Customer Segment': 'Who buys in your market today, from the research.',
  'Competitive Landscape': 'How the alternatives compare, and where you win and lose.',
  Competitor: 'What this competitor offers, how they position, and how you compare.',
  'Current Messaging': 'What your website says today, read the way a buyer would.',
  'Social Taglines': 'Your bios and taglines on social profiles, side by side.',
  'Why Now': 'The market shifts that make your offer matter now.',
  'Market Segment': 'The market you compete in: its size, trends and buyers.',
  'Research Summary': 'A summary of the company research: where you stand today.',
  'Company Profile': 'What you told the app about your company. You can edit it here.',
  'Company Overview': 'Your company as the research found it: what you do and for whom.',
  'Product Overview': 'What you sell and how it works, from your website and files.',
  'Recent Developments': 'News, launches and changes from the last year.',
  Strengths: 'What you do well, according to the evidence.',
  Weaknesses: 'Gaps and risks a buyer or a competitor might point to.'
}

type Nav = Pick<
  ArticleSpec,
  | 'navSection'
  | 'navOrder'
  | 'navLabel'
  | 'navParent'
  | 'labelPrefix'
  | 'dependsOn'
  | 'navSubtitle'
  | 'navHelp'
>

const nav = (
  navSection: NavSection,
  navOrder: number,
  navLabel: string,
  dependsOn: string[] = [],
  more: Partial<Nav> = {}
): Nav => ({
  navSection,
  navOrder,
  navLabel,
  navParent: null,
  labelPrefix: null,
  dependsOn,
  navSubtitle: '',
  navHelp: HELP[navLabel] ?? '',
  ...more
})

const child = (
  navSection: NavSection,
  navParent: string | VirtualParent,
  labelPrefix: string,
  dependsOn: string[] = []
): Nav =>
  nav(navSection, 0, '', dependsOn, { navParent, labelPrefix, navHelp: HELP[labelPrefix] ?? '' })

const fixed = (
  slug: string,
  category: Category,
  volatility: Volatility,
  title: string,
  group: ArticleGroup,
  task: string,
  template: string | null,
  aliases: string[],
  placement: Nav
): ArticleSpec => ({
  slug,
  pattern: false,
  category,
  volatility,
  title,
  aliases,
  group,
  template,
  task,
  ...placement
})

const pattern = (
  prefix: string,
  category: Category,
  volatility: Volatility,
  group: ArticleGroup,
  task: string,
  template: string | null,
  placement: Nav
): ArticleSpec => ({
  slug: prefix,
  pattern: true,
  category,
  volatility,
  title: '',
  aliases: [],
  group,
  template,
  task,
  ...placement
})

/** The company research the synthesis reads. */
const RESEARCH = [
  'company-overview',
  'product-overview',
  'market-segment',
  'customer-segment',
  'strengths',
  'weaknesses',
  'recent-developments',
  'competitor-*'
]

const CR = 'company-research/assets'
const PB = 'positioning-playbook/assets'

export const ARTICLE_MAP: ArticleSpec[] = [
  // 6.1 wiki/topics/
  fixed(
    'company-overview',
    'topic',
    'cold',
    'Company Overview',
    'Company',
    'research-01-overview',
    `${CR}/01-company-overview.md`,
    ['company', 'about'],
    nav('company', 2, 'Company Overview', ['current-messaging'])
  ),
  fixed(
    'product-overview',
    'topic',
    'warm',
    'Product Overview',
    'Company',
    'research-02-product',
    `${CR}/02-product-analysis.md`,
    ['product', 'offering'],
    nav('company', 3, 'Product Overview')
  ),
  fixed(
    'market-segment',
    'topic',
    'warm',
    'Market Segment',
    'Market',
    'research-03-market-segment',
    `${CR}/03-market-segment.md`,
    ['industry', 'market'],
    nav('market', 2, 'Market Segment')
  ),
  fixed(
    'customer-segment',
    'topic',
    'warm',
    'Customer Segment',
    'Customers',
    'research-04-customer-segment',
    `${CR}/04-customer-segment.md`,
    ['customers', 'clients'],
    nav('customers', 2, 'Customer Segment')
  ),
  fixed(
    'recent-developments',
    'topic',
    'hot',
    'Recent Developments',
    'Company',
    'research-07-recent-developments',
    `${CR}/07-recent-developments.md`,
    ['news', 'launches'],
    nav('company', 4, 'Recent Developments')
  ),
  fixed(
    'market-position-summary',
    'topic',
    'warm',
    'Market Position Summary',
    'Market',
    'research-09-synthesis',
    `${CR}/09-synthesis.md`,
    ['research summary'],
    nav('market', 3, 'Research Summary', RESEARCH)
  ),
  fixed(
    'market-overview',
    'topic',
    'warm',
    'Market Overview',
    'Market',
    'playbook-01-market',
    `${PB}/01-market-overview.md`,
    ['why now', 'market shifts'],
    nav('market', 1, 'Why Now', ['market-position-summary', 'current-messaging'])
  ),
  fixed(
    'ideal-customer-profile',
    'topic',
    'warm',
    'Ideal Customer Profile',
    'Customers',
    'playbook-02-icp',
    `${PB}/02-target-customers.md`,
    ['ICP', 'target customer', 'ideal customer'],
    nav('customers', 1, 'Ideal Customer Profile', ['market-position-summary', 'current-messaging'])
  ),
  fixed(
    'competitive-landscape',
    'topic',
    'hot',
    'Competitive Landscape',
    'Competitors',
    'playbook-06-competitive',
    `${PB}/06-competitive-intelligence.md`,
    ['competition', 'market map'],
    nav('competitors', 1, 'Competitive Landscape', ['competitor-*'])
  ),
  fixed(
    'current-messaging',
    'topic',
    'hot',
    'Current Messaging',
    'Messaging',
    'website-positioning',
    'website-positioning/assets/website-positioning.md',
    ['website messaging', 'current positioning'],
    nav('messaging', 1, 'Current Messaging')
  ),
  // 6.2 wiki/concepts/
  fixed(
    'positioning-statement',
    'concept',
    'cold',
    'Positioning Statement',
    'Positioning',
    'playbook-05-statement',
    `${PB}/05-positioning-statement.md`,
    ['positioning', 'value proposition'],
    nav('positioning', 1, 'Positioning Statement', [
      'market-overview',
      'ideal-customer-profile',
      'value-drivers',
      'moat-*',
      'competitive-landscape'
    ])
  ),
  fixed(
    'value-drivers',
    'concept',
    'cold',
    'Value Drivers',
    'Positioning',
    'playbook-03-value',
    `${PB}/03-value-drivers.md`,
    ['value pillars', 'outcomes'],
    nav('positioning', 2, 'Value Drivers', ['ideal-customer-profile', 'market-position-summary'])
  ),
  pattern(
    'value-driver-',
    'concept',
    'cold',
    'Positioning',
    'playbook-03-value',
    `${PB}/03-value-drivers.md`,
    child('positioning', 'value-drivers', 'Value Driver', [
      'ideal-customer-profile',
      'market-position-summary'
    ])
  ),
  pattern(
    'moat-',
    'concept',
    'cold',
    'Positioning',
    'playbook-04-moat',
    `${PB}/04-distinct-advantages.md`,
    child('positioning', 'moats', 'Moat', [
      'value-drivers',
      'ideal-customer-profile',
      'market-position-summary'
    ])
  ),
  // 6.3 wiki/references/
  fixed(
    'company-profile',
    'reference',
    'cold',
    'Company Profile',
    'Company',
    'app',
    null,
    ['profile'],
    nav('company', 1, 'Company Profile', [], { navSubtitle: 'What you told us' })
  ),
  fixed(
    'strengths',
    'reference',
    'warm',
    'Strengths',
    'Company',
    'research-05-strengths',
    `${CR}/05-strengths.md`,
    [],
    nav('company', 5, 'Strengths')
  ),
  fixed(
    'weaknesses',
    'reference',
    'warm',
    'Weaknesses',
    'Company',
    'research-06-weaknesses',
    `${CR}/06-weaknesses.md`,
    [],
    nav('company', 6, 'Weaknesses')
  ),
  pattern(
    'competitor-',
    'reference',
    'hot',
    'Competitors',
    'competitor-profiles',
    'competitor-profile/assets/competitor-profile.md',
    child('competitors', 'competitor-profiles', 'Competitor')
  ),
  fixed(
    'proof-points',
    'reference',
    'warm',
    'Proof Points',
    'Proof',
    'playbook-07-proof',
    `${PB}/07-customer-proof-points.md`,
    ['proof', 'customer evidence'],
    nav('positioning', 4, 'Proof Points')
  ),
  fixed(
    'social-taglines',
    'reference',
    'hot',
    'Social Taglines',
    'Messaging',
    'social-taglines',
    'social-taglines/assets/social-taglines.md',
    ['social bios'],
    nav('messaging', 2, 'Social Taglines')
  ),
  pattern(
    'decision-',
    'reference',
    'cold',
    'Decisions',
    'app',
    null,
    child('positioning', 'decisions', 'Decision')
  )
]

/**
 * The playbook's seven steps (REQUIREMENTS-v4 4.1), in skill-pack order. `slug` is the section's
 * own article (none for Distinct Advantages); `cards` is the prefix of the articles shown as cards
 * and `cardLabel` the heading prefix assembly gives them. `takeaways` marks the articles that carry
 * Key takeaways and Gap to close (spec 6.6 addition). `scoreDimension` maps a step to a Messaging
 * Analysis scorecard dimension for the gap chip.
 */
export interface PlaybookStep {
  id: StepId
  n: number
  title: string
  stepLabel: string
  slug: string
  cards: string | null
  cardLabel: string | null
  takeaways: boolean
  scoreDimension: (typeof SCORE_DIMENSIONS)[number] | null
}

export const PLAYBOOK_STEPS: PlaybookStep[] = [
  step('market', 1, 'Market Overview', 'Market', 'market-overview'),
  step('customers', 2, 'Target Customers', 'Customers', 'ideal-customer-profile', {
    scoreDimension: 'Customer focus'
  }),
  step('value', 3, 'Value Drivers', 'Value', 'value-drivers', {
    cards: 'value-driver-',
    cardLabel: 'Value Driver'
  }),
  step('advantages', 4, 'Distinct Advantages', 'Advantages', '', {
    cards: 'moat-',
    cardLabel: 'Moat',
    takeaways: false
  }),
  step('positioning', 5, 'Positioning Statement', 'Positioning', 'positioning-statement', {
    scoreDimension: 'Differentiation'
  }),
  step('competitors', 6, 'Competitive Intelligence', 'Competitors', 'competitive-landscape', {
    cards: 'competitor-',
    cardLabel: 'Competitor'
  }),
  step('proof', 7, 'Customer Proof Points', 'Proof', 'proof-points', { scoreDimension: 'Proof' })
]

function step(
  id: StepId,
  n: number,
  title: string,
  stepLabel: string,
  slug: string,
  more: Partial<PlaybookStep> = {}
): PlaybookStep {
  return {
    id,
    n,
    title,
    stepLabel,
    slug,
    cards: null,
    cardLabel: null,
    takeaways: true,
    scoreDimension: null,
    ...more
  }
}

/** The five "Start here" articles for the master index, in order (spec section 5). */
export const START_HERE = [
  'positioning-statement',
  'ideal-customer-profile',
  'value-drivers',
  'competitive-landscape',
  'company-profile'
] as const

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DECISION_RE = /^decision-\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/

export const isSlug = (s: string): boolean => SLUG_RE.test(s) && s.length <= 80

/** The spec entry a slug belongs to, or null if the slug is not in the map. */
export function specFor(slug: string): ArticleSpec | null {
  if (!isSlug(slug)) return null
  const exact = ARTICLE_MAP.find((a) => !a.pattern && a.slug === slug)
  if (exact) return exact
  // value-drivers is fixed; value-driver-<x> is a pattern. Longest prefix wins.
  const matches = ARTICLE_MAP.filter(
    (a) => a.pattern && slug.startsWith(a.slug) && slug.length > a.slug.length
  ).sort((a, b) => b.slug.length - a.slug.length)
  const spec = matches[0] ?? null
  if (spec?.slug === 'decision-' && !DECISION_RE.test(slug)) return null
  return spec
}

/** wiki/<folder>/<slug>.md for a slug in the map, or null. */
export function pathForSlug(slug: string): string | null {
  const spec = specFor(slug)
  return spec ? articleRel(spec.category, slug) : null
}

/** Slugs a task may write (fixed slugs exactly, patterns as "prefix*"). */
export function slugsForTask(task: string): ArticleSpec[] {
  return ARTICLE_MAP.filter((a) => a.task === task)
}
