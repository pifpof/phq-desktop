import type { Category, Volatility } from '@shared/wiki-types'
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
}

const fixed = (
  slug: string,
  category: Category,
  volatility: Volatility,
  title: string,
  group: ArticleGroup,
  task: string,
  template: string | null,
  aliases: string[] = []
): ArticleSpec => ({
  slug,
  pattern: false,
  category,
  volatility,
  title,
  aliases,
  group,
  template,
  task
})

const pattern = (
  prefix: string,
  category: Category,
  volatility: Volatility,
  group: ArticleGroup,
  task: string,
  template: string | null
): ArticleSpec => ({
  slug: prefix,
  pattern: true,
  category,
  volatility,
  title: '',
  aliases: [],
  group,
  template,
  task
})

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
    ['company', 'about']
  ),
  fixed(
    'product-overview',
    'topic',
    'warm',
    'Product Overview',
    'Company',
    'research-02-product',
    `${CR}/02-product-analysis.md`,
    ['product', 'offering']
  ),
  fixed(
    'market-segment',
    'topic',
    'warm',
    'Market Segment',
    'Market',
    'research-03-market-segment',
    `${CR}/03-market-segment.md`,
    ['industry', 'market']
  ),
  fixed(
    'customer-segment',
    'topic',
    'warm',
    'Customer Segment',
    'Customers',
    'research-04-customer-segment',
    `${CR}/04-customer-segment.md`,
    ['customers', 'clients']
  ),
  fixed(
    'recent-developments',
    'topic',
    'hot',
    'Recent Developments',
    'Company',
    'research-07-recent-developments',
    `${CR}/07-recent-developments.md`,
    ['news', 'launches']
  ),
  fixed(
    'market-position-summary',
    'topic',
    'warm',
    'Market Position Summary',
    'Market',
    'research-09-synthesis',
    `${CR}/09-synthesis.md`,
    ['research summary']
  ),
  fixed(
    'market-overview',
    'topic',
    'warm',
    'Market Overview',
    'Market',
    'playbook-01-market',
    `${PB}/01-market-overview.md`,
    ['why now', 'market shifts']
  ),
  fixed(
    'ideal-customer-profile',
    'topic',
    'warm',
    'Ideal Customer Profile',
    'Customers',
    'playbook-02-icp',
    `${PB}/02-target-customers.md`,
    ['ICP', 'target customer', 'ideal customer']
  ),
  fixed(
    'competitive-landscape',
    'topic',
    'hot',
    'Competitive Landscape',
    'Competitors',
    'playbook-06-competitive',
    `${PB}/06-competitive-intelligence.md`,
    ['competition', 'market map']
  ),
  fixed(
    'current-messaging',
    'topic',
    'hot',
    'Current Messaging',
    'Messaging',
    'website-positioning',
    'website-positioning/assets/website-positioning.md',
    ['website messaging', 'current positioning']
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
    ['positioning', 'value proposition']
  ),
  fixed(
    'value-drivers',
    'concept',
    'cold',
    'Value Drivers',
    'Positioning',
    'playbook-03-value',
    `${PB}/03-value-drivers.md`,
    ['value pillars', 'outcomes']
  ),
  pattern(
    'value-driver-',
    'concept',
    'cold',
    'Positioning',
    'playbook-03-value',
    `${PB}/03-value-drivers.md`
  ),
  pattern(
    'moat-',
    'concept',
    'cold',
    'Positioning',
    'playbook-04-moat',
    `${PB}/04-distinct-advantages.md`
  ),
  // 6.3 wiki/references/
  fixed('company-profile', 'reference', 'cold', 'Company Profile', 'Company', 'app', null, [
    'profile'
  ]),
  fixed(
    'strengths',
    'reference',
    'warm',
    'Strengths',
    'Company',
    'research-05-strengths',
    `${CR}/05-strengths.md`
  ),
  fixed(
    'weaknesses',
    'reference',
    'warm',
    'Weaknesses',
    'Company',
    'research-06-weaknesses',
    `${CR}/06-weaknesses.md`
  ),
  pattern(
    'competitor-',
    'reference',
    'hot',
    'Competitors',
    'competitor-profiles',
    'competitor-profile/assets/competitor-profile.md'
  ),
  fixed(
    'proof-points',
    'reference',
    'warm',
    'Proof Points',
    'Proof',
    'playbook-07-proof',
    `${PB}/07-customer-proof-points.md`,
    ['proof', 'customer evidence']
  ),
  fixed(
    'social-taglines',
    'reference',
    'hot',
    'Social Taglines',
    'Messaging',
    'social-taglines',
    'social-taglines/assets/social-taglines.md',
    ['social bios']
  ),
  pattern('decision-', 'reference', 'cold', 'Decisions', 'app', null)
]

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
