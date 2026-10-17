import { slugify } from '../wiki/paths'

/** A slug of at most 50 characters, cut at a word boundary. */
export function shortSlug(title: string, fallback: string): string {
  const s = slugify(title, fallback)
  if (s.length <= 50) return s
  const cut = s.slice(0, 51)
  return cut.slice(0, cut.lastIndexOf('-') > 20 ? cut.lastIndexOf('-') : 50).replace(/-+$/, '')
}

/**
 * Splitting a v1 playbook into articles (REQUIREMENTS-v2 6.3). Sections 1, 2, 5, 6, 7 map one to
 * one. Section 3 splits on its "#### Value Driver: ..." headings and section 4 on its
 * "### Moat N: ..." headings. When those headings aren't there, an AI fallback (no web tools)
 * may split them; without one the whole section becomes one article and the report says so.
 */

export interface SplitPart {
  slug: string
  title: string
  /** Markdown with ## as the top level. */
  body: string
}

export interface SectionSplit {
  /** The index article (value-drivers) or null for moats, which have none. */
  main: SplitPart | null
  parts: SplitPart[]
  /** False when the headings were missing and nothing was split. */
  split: boolean
}

/** Moves headings up so the shallowest is ## (an article's sections), outside code blocks. */
export function promote(md: string): string {
  let inCode = false
  const levels = md
    .split('\n')
    .filter((l) => {
      if (/^\s*```/.test(l)) inCode = !inCode
      return !inCode && /^#{2,6}\s/.test(l)
    })
    .map((l) => /^(#+)/.exec(l)![1].length)
  const shift = levels.length ? Math.min(...levels) - 2 : 0
  if (shift <= 0) return md.trim()
  inCode = false
  return md
    .split('\n')
    .map((l) => {
      if (/^\s*```/.test(l)) inCode = !inCode
      if (inCode) return l
      const m = /^(#{2,6})(\s.*)$/.exec(l)
      return m ? `${'#'.repeat(Math.max(2, m[1].length - shift))}${m[2]}` : l
    })
    .join('\n')
    .trim()
}

/** The section body without its "## Section N: Title" line and any trailing Sources list. */
export function sectionBody(md: string): string {
  return md
    .replace(/^#\s+.*\n+/, '')
    .replace(/^##\s+Section\s+\d+:.*\n+/m, '')
    .replace(/\n#{2,4}\s+Sources\s*\n[\s\S]*$/i, '')
    .trim()
}

/** Splits `md` on lines matching `heading`; each part runs to the next heading of its level or higher. */
function splitOn(
  md: string,
  heading: RegExp
): { before: string; parts: { title: string; text: string }[]; after: string } {
  const lines = md.split('\n')
  const parts: { title: string; text: string[] }[] = []
  const before: string[] = []
  const after: string[] = []
  let level = 0
  let current: { title: string; text: string[] } | null = null
  let done = false
  for (const line of lines) {
    const m = heading.exec(line)
    const h = /^(#{1,6})\s/.exec(line)
    if (m) {
      level = h![1].length
      current = { title: m[1].trim(), text: [] }
      parts.push(current)
      continue
    }
    if (current && h && h[1].length <= level) {
      current = null
      done = true
    }
    if (current) current.text.push(line)
    else (done || parts.length ? after : before).push(line)
  }
  return {
    before: before.join('\n').trim(),
    parts: parts.map((p) => ({ title: p.title, text: p.text.join('\n').trim() })),
    after: after.join('\n').trim()
  }
}

export function splitValueDrivers(md: string): SectionSplit {
  const body = sectionBody(md)
  const s = splitOn(body, /^#{3,5}\s+Value Driver(?:\s*\d+)?:\s*(.+)$/i)
  const index: SplitPart = {
    slug: 'value-drivers',
    title: 'Value Drivers',
    body: promote([s.before, s.after].filter(Boolean).join('\n\n'))
  }
  if (!s.parts.length) return { main: { ...index, body: promote(body) }, parts: [], split: false }
  return {
    main: index,
    parts: s.parts.map((p) => ({
      slug: `value-driver-${shortSlug(p.title, 'driver')}`,
      title: p.title,
      body: promote(p.text)
    })),
    split: true
  }
}

export function splitMoats(md: string): SectionSplit & { rest: string } {
  const body = sectionBody(md)
  const s = splitOn(body, /^#{3,5}\s+Moat\s*\d*:\s*(.+)$/i)
  if (!s.parts.length)
    return {
      main: null,
      parts: [
        { slug: 'moat-distinct-advantages', title: 'Distinct Advantages', body: promote(body) }
      ],
      split: false,
      rest: ''
    }
  return {
    main: null,
    parts: s.parts.map((p) => ({
      slug: `moat-${shortSlug(p.title, 'advantage')}`,
      title: p.title,
      body: promote(p.text)
    })),
    split: true,
    // The summary and "what did not make the list": kept in the legacy playbook source.
    rest: [s.before, s.after].filter(Boolean).join('\n\n')
  }
}
