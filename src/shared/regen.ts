import { z } from 'zod'
import { ChangeSchema, type Change } from './changes'

/** The Regenerate preview (REQUIREMENTS-v3.1 4) and the regeneration it starts (4.3, 5). */

const Range = z.object({ low: z.number(), high: z.number() })

export const RegenEstimateSchema = z.object({
  costUsd: Range,
  minutes: Range
})
export type RegenEstimate = z.infer<typeof RegenEstimateSchema>

export const RegenPlanSchema = z.object({
  page: z.object({ slug: z.string(), title: z.string(), path: z.string() }),
  /** Null when the app writes the page itself (the company profile): nothing to regenerate. */
  taskId: z.string().nullable(),
  pending: z.array(ChangeSchema),
  fromOthers: z.array(ChangeSchema),
  respected: z.array(ChangeSchema),
  updates: z.object({
    sources: z.array(
      z.object({ path: z.string(), title: z.string(), kind: z.string(), ingested: z.string() })
    ),
    pages: z.array(
      z.object({ slug: z.string(), title: z.string(), updated: z.string(), why: z.string() })
    ),
    profile: z.array(z.string()),
    changes: z.array(z.object({ id: z.string(), name: z.string(), date: z.string() }))
  }),
  /** The page was edited outside the app since it was last generated. */
  outsideEdit: z.object({ edited: z.boolean(), canDescribe: z.boolean() }),
  /** The page's task uses web tools, so "Also refresh web research" applies. */
  web: z.boolean(),
  /** Why a web refresh is not offered, when it isn't. */
  refreshBlocked: z.string(),
  dependents: z.array(z.object({ slug: z.string(), title: z.string(), taskId: z.string() })),
  reassemblesPlaybook: z.boolean(),
  estimate: z.object({
    base: RegenEstimateSchema,
    refresh: RegenEstimateSchema,
    dependents: RegenEstimateSchema,
    budgetCapUsd: z.number(),
    model: z.string()
  }),
  /** The page is private, so a change citing a private file adds nothing to note. */
  pagePrivate: z.boolean()
})
export type RegenPlan = z.infer<typeof RegenPlanSchema>

/** Adding key takeaways and gaps to an existing playbook (REQUIREMENTS-v4 7.3): the preview. */
export const TakeawaysPlanSchema = z.object({
  pages: z.array(z.object({ slug: z.string(), title: z.string(), path: z.string() })),
  /** Distinct Advantages gets takeaways too (from the moat articles). */
  advantages: z.boolean(),
  estimate: RegenEstimateSchema,
  budgetCapUsd: z.number(),
  model: z.string(),
  /** Some section is private: its takeaways may draw on private material. */
  private: z.boolean()
})
export type TakeawaysPlan = z.infer<typeof TakeawaysPlanSchema>

/** Regenerate playbook (REQUIREMENTS-v4 4): what runs again and roughly what it costs. Reads only. */
export const PlaybookRegenPlanSchema = z.object({
  tasks: z.array(z.object({ id: z.string(), title: z.string() })),
  estimate: RegenEstimateSchema,
  budgetCapUsd: z.number(),
  model: z.string(),
  /** Changes waiting on playbook pages: a full re-run respects only applied ones. */
  waiting: z.number()
})
export type PlaybookRegenPlan = z.infer<typeof PlaybookRegenPlanSchema>

export const RegenStartSchema = z.object({
  page: z.string().min(1).max(80),
  /** Changes to apply: this page's and any included from other pages. */
  changeIds: z.array(z.string().max(120)).max(30),
  refreshWeb: z.boolean(),
  dependents: z.boolean(),
  budgetCapUsd: z.number().positive().max(1000).optional()
})
export type RegenStart = z.infer<typeof RegenStartSchema>

export interface RegenWarning {
  kind: 'sameSection' | 'undoes' | 'private' | 'outsideEdit'
  text: string
  /** For "undoes": the applied change that would be replaced. */
  replaces?: string
}

/** Warnings for the changes included (REQUIREMENTS-v3.1 4.2). Never blocking. */
export function regenWarnings(plan: RegenPlan, included: Change[]): RegenWarning[] {
  const out: RegenWarning[] = []
  const bySection = new Map<string, Change[]>()
  for (const c of included)
    if (c.section) bySection.set(c.section, [...(bySection.get(c.section) ?? []), c])
  for (const [section, list] of bySection)
    if (list.length > 1 && new Set(list.map((c) => c.changeTo.trim())).size > 1)
      out.push({
        kind: 'sameSection',
        text: `These ${list.length === 2 ? 'two changes both' : `${list.length} changes all`} rewrite ${section}: ${list.map((c) => `"${c.name}"`).join(' and ')}. The newer one wins unless you edit them.`
      })
  for (const c of included) {
    if (!c.section) continue
    const earlier = plan.respected.find((r) => r.section === c.section && r.id !== c.id)
    if (earlier)
      out.push({
        kind: 'undoes',
        text: `"${c.name}" may undo an earlier change ("${earlier.name}", ${earlier.statusDate}). If you continue, the earlier change will be marked as replaced.`,
        replaces: earlier.id
      })
  }
  if (!plan.pagePrivate && included.some((c) => c.private))
    out.push({
      kind: 'private',
      text: `A change uses one of your private files, so ${plan.page.title} will be marked private and left out of exports unless you include private articles.`
    })
  if (plan.outsideEdit.edited)
    out.push({
      kind: 'outsideEdit',
      text: 'You edited this page in another editor. Regenerating will replace those edits unless you turn them into a change.'
    })
  return out
}

export const RegenJobSchema = z.object({
  runId: z.string(),
  page: z.string(),
  pageTitle: z.string(),
  taskId: z.string(),
  changes: z.array(z.object({ id: z.string(), name: z.string() })),
  refreshWeb: z.boolean(),
  /** Pages still to regenerate after this one ("Then update pages that depend on this"). */
  queue: z.array(z.string()),
  status: z.enum(['running', 'review', 'failed', 'kept', 'discarded']),
  files: z.array(z.object({ rel: z.string(), title: z.string() })),
  report: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      applied: z.enum(['yes', 'partly', 'no']),
      note: z.string()
    })
  ),
  /** Applied changes the included ones replace (REQUIREMENTS-v3.1 4.2). */
  replaces: z.array(z.string()),
  costUsd: z.number(),
  startedAt: z.string()
})
export type RegenJob = z.infer<typeof RegenJobSchema>

export const RegenReviewSchema = z.object({
  job: RegenJobSchema,
  files: z.array(
    z.object({
      rel: z.string(),
      title: z.string(),
      before: z.string().nullable(),
      after: z.string()
    })
  )
})
export type RegenReview = z.infer<typeof RegenReviewSchema>

export const KeepResultSchema = z.object({
  written: z.array(z.string()),
  applied: z.array(z.string()),
  /** Names of changes the model reported as not applied: they stay waiting. */
  notApplied: z.array(z.string()),
  /** The next page queued, now regenerating. */
  next: z.string().nullable()
})
export type KeepResult = z.infer<typeof KeepResultSchema>
