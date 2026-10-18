import { z } from 'zod'
import { TreeSourceSchema } from './wiki-tree'

/** What the Knowledge, Sources and Use your wiki views show (REQUIREMENTS-v2 4.1, 4.5). */

export const ArticleSummarySchema = z.object({
  slug: z.string(),
  path: z.string(),
  title: z.string(),
  summary: z.string(),
  /** Knowledge tab group: Company, Market, Customers, Positioning, Competitors, Proof, Messaging, Decisions, Other. */
  group: z.string(),
  category: z.string(),
  confidence: z.string(),
  volatility: z.string(),
  verified: z.string(),
  updated: z.string(),
  private: z.boolean()
})
export type ArticleSummary = z.infer<typeof ArticleSummarySchema>

export const SourceSummarySchema = z.object({
  path: z.string(),
  title: z.string(),
  summary: z.string(),
  /** URL, or the kept original for a user file. */
  source: z.string(),
  ingested: z.string(),
  tags: z.array(z.string()),
  /** Sources tab group: Your website, Competitor sites, Web citations, Social, Your files, Other. */
  group: z.string()
})
export type SourceSummary = z.infer<typeof SourceSummarySchema>

export const ArticleDetailSchema = z.object({
  article: ArticleSummarySchema,
  body: z.string(),
  aliases: z.array(z.string()),
  /** First-party first, then social, competitor sites, web citations, legacy; newest first. */
  sources: z.array(TreeSourceSchema),
  backlinks: z.array(z.object({ path: z.string(), title: z.string() })),
  /** Research task that writes this article, for Re-run. Null for the profile and decisions. */
  taskId: z.string().nullable()
})
export type ArticleDetail = z.infer<typeof ArticleDetailSchema>

export const OutputVersionSchema = z.object({
  path: z.string(),
  version: z.number(),
  date: z.string(),
  title: z.string()
})
export type OutputVersion = z.infer<typeof OutputVersionSchema>

export const DecisionInputSchema = z.object({
  title: z.string().trim().min(3).max(120),
  decided: z.string().trim().min(3).max(4000),
  why: z.string().trim().max(4000),
  /** Slugs of the articles the decision changes. */
  affects: z.array(z.string().max(80)).max(12)
})
export type DecisionInput = z.infer<typeof DecisionInputSchema>

/** Playbook section number to the article slugs it is built from (REQUIREMENTS-v2 3.4). */
export const PLAYBOOK_SECTION_ARTICLES: Record<number, { slug?: string; prefix?: string }> = {
  1: { slug: 'market-overview' },
  2: { slug: 'ideal-customer-profile' },
  3: { slug: 'value-drivers', prefix: 'value-driver-' },
  4: { prefix: 'moat-' },
  5: { slug: 'positioning-statement' },
  6: { slug: 'competitive-landscape' },
  7: { slug: 'proof-points' }
}
