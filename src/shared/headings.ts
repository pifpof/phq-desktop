/**
 * Duplicate headings in the playbook (REQUIREMENTS-v4.4 5). Articles often repeat their own title as
 * the first heading of the body ("## Value Driver: Speed" under a card titled "Speed"), and older
 * playbook versions carry the doubled prefix. Used at assembly and at render, so old versions read clean.
 */

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A card prefix with its separator: "Value Driver:", "Value Driver 1:", "Moat -". */
const PREFIX = /^(?:value\s+drivers?|driver|moat|competitor)\s*(?:#?\d+)?\s*[:.\-–—]\s*/

/** Lowercase, no emphasis, numbering, card prefixes or "for <Company>", single spaces. */
export function normalizeHeading(text: string, company?: string): string {
  let s = text.toLowerCase().replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim()
  for (let before = ''; before !== s;) {
    before = s
    s = s
      .replace(/^#?\d+\s*[.)]?\s+/, '')
      .replace(PREFIX, '')
      .trim()
  }
  if (company?.trim())
    s = s.replace(new RegExp(`\\s+for\\s+${escapeRe(company.trim().toLowerCase())}$`), '')
  return s.replace(/[\s:.\-–—]+$/, '').trim()
}

/**
 * True when a heading only repeats the title it sits under: equal, the title "for" someone, or most
 * of the title. A short heading that merely shares a word ("Cost" under "Lower Total Cost") is kept.
 */
export function isDuplicateHeading(heading: string, title: string, company?: string): boolean {
  const h = normalizeHeading(heading, company)
  const t = normalizeHeading(title, company)
  if (!h || !t) return false
  if (h === t) return true
  if (h.startsWith(t) && /^\s+for\s+\S/.test(h.slice(t.length))) return true
  return t.includes(h) && h.length >= 0.6 * t.length
}

/**
 * Drops the first heading of a block of markdown when it repeats the title, as long as no other
 * heading comes before it. Text before it (a lede line) stays. Code blocks are left alone.
 */
export function dropDuplicateHeading(md: string, title: string, company?: string): string {
  const lines = md.split('\n')
  let inCode = false
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) inCode = !inCode
    if (inCode) continue
    const m = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(lines[i])
    if (!m) continue
    if (!isDuplicateHeading(m[1], title, company)) return md
    const next = lines[i + 1] === '' ? 2 : 1
    lines.splice(i, next)
    return lines.join('\n')
  }
  return md
}

const CARD_LABELS = ['Value Driver', 'Moat', 'Competitor']

/**
 * A playbook output file as markdown, with the duplicates removed: a card heading's doubled prefix
 * ("Value Driver: Value Driver: X") and a card body's first heading that repeats the card title.
 * For Copy as markdown and Copy this section, so they match the page. The file itself is never rewritten.
 */
export function cleanPlaybookMarkdown(md: string, company?: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let card: string | null = null
  let inCode = false
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    if (/^\s*```/.test(line)) inCode = !inCode
    const h = inCode ? null : /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) {
      const level = h[1].length
      const label = CARD_LABELS.find((l) => new RegExp(`^${l}\\s*:`, 'i').test(h[2]))
      if (level <= 3) card = null
      if (level === 3 && label) {
        const title = h[2].replace(new RegExp(`^(?:${label}\\s*:\\s*)+`, 'i'), '').trim()
        line = `### ${label}: ${title}`
        card = title
      } else if (card !== null && level > 3) {
        const dup = isDuplicateHeading(h[2], card, company)
        card = null
        if (dup) {
          if (lines[i + 1] === '') i++
          continue
        }
      }
    }
    out.push(line)
  }
  return out.join('\n')
}
