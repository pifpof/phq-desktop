import { z } from 'zod'

/** Results of the wiki conformance check (REQUIREMENTS-v2 section 5). */

export const SEVERITIES = ['critical', 'warning', 'suggestion', 'info'] as const
export type Severity = (typeof SEVERITIES)[number]

export const FindingSchema = z.object({
  /** llm-wiki check (C1, C2, ...) or spec check (S12.2, ...). */
  check: z.string(),
  severity: z.enum(SEVERITIES),
  /** Wiki-relative path, or '' for the whole wiki. */
  path: z.string(),
  message: z.string(),
  /** What to do about it, in plain words. */
  hint: z.string().optional(),
  /** The app can fix it mechanically (wiki:fix). */
  fixable: z.boolean(),
  /** Checks llm-wiki's own lint runs, or the PositioningHQ spec adds. */
  origin: z.enum(['llm-wiki', 'phq'])
})
export type Finding = z.infer<typeof FindingSchema>

export const CheckReportSchema = z.object({
  checkedAt: z.string(),
  /** YYYY-MM-DD used for freshness. */
  today: z.string(),
  findings: z.array(FindingSchema),
  counts: z.object({
    critical: z.number(),
    warning: z.number(),
    suggestion: z.number(),
    info: z.number()
  }),
  /** Articles past their refresh date (C14). Counted apart: aging is not a format defect. */
  stale: z.number(),
  /** No critical findings and no warnings other than freshness. */
  ok: z.boolean()
})
export type CheckReport = z.infer<typeof CheckReportSchema>

export const FixReportSchema = z.object({
  fixed: z.array(z.string()),
  report: CheckReportSchema
})
export type FixReport = z.infer<typeof FixReportSchema>

/** The freshness check, reported apart from format findings. */
export const FRESHNESS_CHECK = 'C14'
