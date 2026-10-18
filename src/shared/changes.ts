import { z } from 'zod'

/**
 * Changes (REQUIREMENTS-v3.1 2): a founder's instruction to change a page. Stored as a decision
 * article (spec 6.4) with a Status line; the UI always says "change".
 */

export const CHANGE_STATUSES = ['pending', 'applied', 'withdrawn', 'replaced'] as const
export type ChangeStatus = (typeof CHANGE_STATUSES)[number]

const text = (max: number) => z.string().trim().max(max)

/** What the dialog sends. */
export const ChangeInputSchema = z.object({
  /** Slug of the page the change is made on. */
  page: z.string().min(1).max(80),
  /** An H2 heading of the page, or null for the whole page. */
  section: text(200).nullable(),
  quote: text(2000),
  why: text(4000).min(3),
  changeTo: text(4000).min(3),
  /** Raw files the regeneration should use. */
  basedOn: z.array(z.string().max(500)).max(20),
  /** Notes pasted in the dialog, saved as a private raw note on save. */
  notes: text(20_000),
  /** Slugs of the pages it affects besides its own (computed, then edited). */
  affects: z.array(z.string().max(80)).max(40)
})
export type ChangeInput = z.infer<typeof ChangeInputSchema>

export const ChangeSchema = z.object({
  /** The decision article's slug. */
  id: z.string(),
  path: z.string(),
  /** Short name, from the title. */
  name: z.string(),
  page: z.string(),
  pageTitle: z.string(),
  section: z.string().nullable(),
  quote: z.string(),
  why: z.string(),
  changeTo: z.string(),
  basedOn: z.array(z.object({ path: z.string(), title: z.string() })),
  affects: z.array(z.object({ slug: z.string(), title: z.string() })),
  status: z.enum(CHANGE_STATUSES),
  /** Applied, withdrawn or replaced on. */
  statusDate: z.string(),
  /** For applied: the page it was applied to. For replaced: the change that replaced it. */
  statusRef: z.string(),
  created: z.string(),
  /** A "Decision:" article from before v3.1 (no Status line): treated as applied. */
  legacy: z.boolean(),
  private: z.boolean()
})
export type Change = z.infer<typeof ChangeSchema>

export const AffectsSchema = z.object({
  pages: z.array(z.object({ slug: z.string(), title: z.string() })),
  /** Assembled outputs that include the page. */
  outputs: z.array(z.string())
})
export type Affects = z.infer<typeof AffectsSchema>

/** Generators must respect these (REQUIREMENTS-v3.1 6). */
export const mustRespect = (c: Pick<Change, 'status'>): boolean => c.status === 'applied'
