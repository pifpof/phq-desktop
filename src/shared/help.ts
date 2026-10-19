import { z } from 'zod'
import { links } from './links'
import { StepIdSchema } from './playbook'

/**
 * The Help plan (REQUIREMENTS-v4 9): gaps the founder chose to get help with. App state, never
 * the wiki. "Ask for help with these" opens the hosted form in the browser; the app sends nothing.
 */

export const HelpItemSchema = z.object({
  id: z.string().min(1).max(80),
  step: StepIdSchema,
  section: z.string().min(1).max(120),
  problem: z.string().min(1).max(600),
  nextStep: z.string().max(600),
  /** From a section built on the founder's own files: only its name ever leaves the app. */
  private: z.boolean(),
  addedAt: z.string()
})
export type HelpItem = z.infer<typeof HelpItemSchema>

export const HelpPlanSchema = z.object({
  items: z.array(HelpItemSchema).max(50).default([]),
  /** When the founder asked for help, for their own reference. */
  helpRequested: z.array(z.string()).max(100).default([])
})
export type HelpPlan = z.infer<typeof HelpPlanSchema>

/** The whole URL stays under this (REQUIREMENTS-v4 9). */
export const MAX_HELP_URL = 2000

export interface HelpRequest {
  company: string
  name: string
  email: string
  items: HelpItem[]
}

/**
 * The prefilled request link (EXPERT-HELP-PAGE-REQUIREMENTS 2): non-personal attribution in the
 * query; personal details and gaps in the fragment, so they never reach server logs or analytics.
 * Gaps carry the section and problem only; a private section's problem is never included. When
 * the link would be too long, only section names go, and the sheet offers Copy details instead.
 */
export function helpRequestLink(r: HelpRequest): { url: string; short: boolean } {
  const base = new URL(links.helpRequestUrl)
  base.searchParams.set('utm_source', 'phq-desktop')
  base.searchParams.set('utm_medium', 'app')
  const sections = [...new Set(r.items.map((i) => i.section))]
  const fragment = (withGaps: boolean): string => {
    const p = new URLSearchParams()
    if (r.company.trim()) p.set('company', r.company.trim())
    if (r.name.trim()) p.set('name', r.name.trim())
    if (r.email.trim()) p.set('email', r.email.trim())
    p.set('sections', sections.join('; '))
    if (withGaps) {
      const gaps = r.items.filter((i) => !i.private).map((i) => `${i.section}: ${i.problem}`)
      if (gaps.length) p.set('gaps', gaps.join('\n'))
    } else p.set('gaps', 'Details: paste from the app')
    p.set('v', '1')
    return p.toString()
  }
  const full = `${base.toString()}#${fragment(true)}`
  if (full.length <= MAX_HELP_URL) return { url: full, short: false }
  return { url: `${base.toString()}#${fragment(false)}`, short: true }
}

/** What Copy details puts on the clipboard: every chosen gap, private ones by section only. */
export function helpDetails(items: HelpItem[]): string {
  return items
    .map((i) =>
      i.private
        ? `${i.section}: a gap from a private section (details kept in the app).`
        : `${i.section}\nProblem: ${i.problem}\nNext step: ${i.nextStep}`
    )
    .join('\n\n')
}
