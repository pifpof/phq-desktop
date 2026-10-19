import { z } from 'zod'

/** The Positioning Playbook page (REQUIREMENTS-v4): steps, takeaways, gaps and the page model. */

export const STEP_IDS = [
  'market',
  'customers',
  'value',
  'advantages',
  'positioning',
  'competitors',
  'proof'
] as const
export const StepIdSchema = z.enum(STEP_IDS)
export type StepId = z.infer<typeof StepIdSchema>

export const GapSchema = z.object({
  problem: z.string().min(1).max(600),
  nextStep: z.string().min(1).max(600)
})
export type Gap = z.infer<typeof GapSchema>

/** Exactly three short lines (REQUIREMENTS-v4 7.1). */
export const TAKEAWAY_MAX_WORDS = 12

export const CardSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** One line shown when collapsed. */
  line: z.string(),
  /** Markdown shown when expanded. */
  body: z.string(),
  /** Value driver cards link back to the overview's driver cards. */
  slug: z.string().nullable()
})
export type Card = z.infer<typeof CardSchema>

export const StatementSchema = z.object({
  fields: z.array(z.tuple([z.string(), z.string()])),
  variations: z.array(z.object({ title: z.string(), body: z.string() }))
})
export type Statement = z.infer<typeof StatementSchema>

export const ScoreChipSchema = z.object({
  dimension: z.string(),
  score: z.number(),
  max: z.number()
})

export const SectionMetaSchema = z.object({
  confidence: z.enum(['high', 'medium', 'low']).nullable(),
  /** Raw sources across the section's source articles. */
  sources: z.array(z.string()),
  lastChanged: z.string().nullable(),
  waiting: z.number(),
  /** The article "Open in Wiki" opens: the section's own article, or its parent. */
  article: z.string().nullable(),
  /** Slugs "Make a change" offers. */
  pages: z.array(z.string()),
  private: z.boolean(),
  scoreChip: ScoreChipSchema.nullable()
})
export type SectionMeta = z.infer<typeof SectionMetaSchema>

export const PlaybookSectionSchema = z.object({
  id: StepIdSchema,
  n: z.number(),
  title: z.string(),
  label: z.string(),
  words: z.number(),
  minutes: z.number(),
  takeaways: z.array(z.string()).nullable(),
  gap: GapSchema.nullable(),
  lede: z.string(),
  /** Markdown before the cards (the landscape overview, the driver index). */
  body: z.string(),
  cards: z.array(CardSchema),
  statement: StatementSchema.nullable(),
  /** Markdown after the statement table and variations. */
  after: z.string(),
  /** The section's markdown as written in the output, for Copy this section. */
  markdown: z.string(),
  missing: z.boolean(),
  meta: SectionMetaSchema
})
export type PlaybookSection = z.infer<typeof PlaybookSectionSchema>

export const OverviewSchema = z.object({
  statement: z.string().nullable(),
  drivers: z.array(z.object({ slug: z.string(), title: z.string(), line: z.string() })),
  whoFor: z.string().nullable(),
  upAgainst: z.string().nullable(),
  biggestGap: z.object({ step: StepIdSchema, problem: z.string() }).nullable()
})
export type Overview = z.infer<typeof OverviewSchema>

export const PlaybookViewSchema = z.object({
  path: z.string(),
  version: z.number(),
  date: z.string(),
  company: z.string(),
  current: z.boolean(),
  sections: z.array(PlaybookSectionSchema),
  overview: OverviewSchema,
  /** Some section has no takeaways: offer the backfill (REQUIREMENTS-v4 7.3). */
  needsTakeaways: z.boolean(),
  private: z.boolean()
})
export type PlaybookView = z.infer<typeof PlaybookViewSchema>

export const PlaybookNavSchema = z.object({
  /** Version path to the steps visited in it. */
  visited: z.record(z.string(), z.array(z.string())).default({}),
  last: z.string().nullable().default(null)
})
export type PlaybookNav = z.infer<typeof PlaybookNavSchema>

/** Biggest gap priority when there is no Messaging Analysis (REQUIREMENTS-v4 6.3). */
export const GAP_PRIORITY: StepId[] = [
  'proof',
  'positioning',
  'customers',
  'value',
  'advantages',
  'competitors',
  'market'
]

/** Reading time: words / 200, rounded up, at least 1. */
export const readingMinutes = (words: number): number => Math.max(1, Math.ceil(words / 200))
