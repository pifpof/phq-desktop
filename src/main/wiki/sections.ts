import { TAKEAWAY_MAX_WORDS, type Gap } from '@shared/playbook'

/**
 * Key takeaways and Gap to close (spec 6.6 addition, REQUIREMENTS-v4 7.1): two optional body
 * sections on playbook section articles, copied into the assembled playbook under each section.
 * Read from articles (## headings) and from assembled outputs (### headings). Absent is normal.
 */

export const TAKEAWAYS_HEADING = 'Key takeaways'
export const GAP_HEADING = 'Gap to close'

/** The text under a heading of this name at any level, up to the next heading at that level or above. */
function sectionText(md: string, name: string): string | null {
  const lines = md.split('\n')
  let inCode = false
  let start = -1
  let level = 0
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) inCode = !inCode
    if (inCode) continue
    const m = /^(#{2,6})\s+(.+?)\s*$/.exec(lines[i])
    if (!m) continue
    if (start >= 0 && m[1].length <= level) return lines.slice(start, i).join('\n').trim()
    if (start < 0 && m[2].toLowerCase() === name.toLowerCase()) {
      start = i + 1
      level = m[1].length
    }
  }
  return start >= 0 ? lines.slice(start).join('\n').trim() : null
}

const clean = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** Exactly three list items, or null. */
export function readTakeaways(md: string): string[] | null {
  const text = sectionText(md, TAKEAWAYS_HEADING)
  if (!text) return null
  const items = [...text.matchAll(/^\s*(?:\d+[.)]|[-*])\s+(.+)$/gm)].map((m) => clean(m[1]))
  return items.length === 3 && items.every(Boolean) ? items : null
}

/** **Problem:** and **Next step:**, both present, or null. */
export function readGap(md: string): Gap | null {
  const text = sectionText(md, GAP_HEADING)
  if (!text) return null
  const field = (label: string): string =>
    clean(
      new RegExp(
        `\\*\\*${label}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\s*\\*\\*[A-Za-z ]+:\\*\\*|$)`,
        'i'
      ).exec(text)?.[1] ?? ''
    )
  const problem = field('Problem')
  const nextStep = field('Next step')
  return problem && nextStep ? { problem, nextStep } : null
}

/** The markdown for both sections at a heading level; empty when there is nothing to write. */
export function renderTakeawaysAndGap(
  takeaways: string[] | null,
  gap: Gap | null,
  level: 2 | 3
): string {
  const h = '#'.repeat(level)
  const parts: string[] = []
  if (takeaways?.length === 3)
    parts.push(
      `${h} ${TAKEAWAYS_HEADING}\n\n${takeaways.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
    )
  if (gap)
    parts.push(
      `${h} ${GAP_HEADING}\n\n**Problem:** ${gap.problem}\n\n**Next step:** ${gap.nextStep}`
    )
  return parts.join('\n\n')
}

const words = (s: string): number => s.split(/\s+/).filter(Boolean).length

/** Problems with model-written takeaways and a gap; empty when they are fine (REQUIREMENTS-v4 7.3). */
export function checkTakeaways(takeaways: unknown, gap: unknown): string[] {
  const errors: string[] = []
  if (!Array.isArray(takeaways) || takeaways.length !== 3) {
    errors.push('takeaways must be exactly three lines.')
  } else {
    takeaways.forEach((t, i) => {
      if (typeof t !== 'string' || !t.trim()) errors.push(`takeaway ${i + 1} is empty.`)
      else if (words(t) > TAKEAWAY_MAX_WORDS)
        errors.push(`takeaway ${i + 1} has more than ${TAKEAWAY_MAX_WORDS} words.`)
      else if (/\n/.test(t.trim())) errors.push(`takeaway ${i + 1} must be one line.`)
    })
  }
  if (gap !== undefined && gap !== null) {
    const g = gap as Partial<Gap>
    if (!g.problem?.trim() || !g.nextStep?.trim())
      errors.push('gap needs both problem and next_step, or leave gap out.')
  }
  return errors
}
