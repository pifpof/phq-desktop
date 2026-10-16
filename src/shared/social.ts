/** The social taglines table (memory/research/social-taglines.md). Read by the app, filled in by the person. */
export const SOCIAL_COLUMNS = ['Network', 'URL', 'Tagline or bio', 'Source', 'Status'] as const

export interface SocialRow {
  network: string
  url: string
  tagline: string
  source: string
  found: boolean
}

/** Table cells, splitting on unescaped pipes only. "\|" is a pipe inside a cell. */
const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\||(?<!\\)\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.replace(/\\\|/g, '|').trim())

/**
 * A quoted bio can contain a stray "|" that splits it into extra cells. The extra cells belong to
 * the tagline, so they are joined back and the columns after it line up again.
 */
function realign(c: string[], width: number, taglineCol: number): string[] {
  if (c.length <= width || taglineCol < 0) return c
  const extra = c.length - width
  return [
    ...c.slice(0, taglineCol),
    c.slice(taglineCol, taglineCol + extra + 1).join(' | '),
    ...c.slice(taglineCol + extra + 1)
  ]
}

const escapeCell = (c: string): string => c.replace(/\|/g, '\\|')

const isSeparator = (line: string): boolean =>
  /^\|?(\s*:?-{3,}:?\s*\|)+\s*:?-*:?\s*\|?$/.test(line.trim())

/** Finds the header line of the social table, or -1. */
function headerIndex(lines: string[]): number {
  return lines.findIndex((l) => {
    if (!l.trim().startsWith('|')) return false
    const h = cells(l).map((c) => c.toLowerCase())
    return h.includes('network') && h.includes('url') && h.includes('status')
  })
}

export function parseSocialTable(markdown: string): SocialRow[] {
  const lines = markdown.split('\n')
  const at = headerIndex(lines)
  if (at < 0) return []
  const header = cells(lines[at]).map((c) => c.toLowerCase())
  const col = (name: string): number => header.findIndex((h) => h.startsWith(name))
  const [n, u, t, s, st] = [
    col('network'),
    col('url'),
    col('tagline'),
    col('source'),
    col('status')
  ]
  const rows: SocialRow[] = []
  for (let i = at + 1; i < lines.length && lines[i].trim().startsWith('|'); i++) {
    if (isSeparator(lines[i])) continue
    const c = realign(cells(lines[i]), header.length, t)
    const network = c[n] ?? ''
    if (!network) continue
    const tagline = (t >= 0 ? c[t] : '') ?? ''
    rows.push({
      network,
      url: c[u] ?? '',
      tagline: tagline.replace(/^"|"$/g, ''),
      source: (s >= 0 ? c[s] : '') ?? '',
      found: /^found$/i.test((c[st] ?? '').trim())
    })
  }
  return rows
}

/** Null when the document has a usable social table, otherwise what is wrong. */
export function checkSocialTable(markdown: string): string | null {
  const lines = markdown.split('\n')
  if (headerIndex(lines) < 0) {
    return `The table is missing. It must have the columns: ${SOCIAL_COLUMNS.join(', ')}.`
  }
  const rows = parseSocialTable(markdown)
  if (rows.length === 0)
    return 'The table has no rows. Include one row for every network, found or not.'
  const bad = rows.filter((r) => !/^(found|not found)$/i.test(r.found ? 'found' : 'not found'))
  return bad.length ? 'Status must be exactly "Found" or "Not found".' : null
}

/** Puts pasted text into a network's row and marks it found. Other rows and text are left as they are. */
export function setTagline(markdown: string, network: string, text: string): string | null {
  const lines = markdown.split('\n')
  const at = headerIndex(lines)
  if (at < 0) return null
  const header = cells(lines[at]).map((c) => c.toLowerCase())
  const col = (name: string): number => header.findIndex((h) => h.startsWith(name))
  const [n, t, s, st] = [col('network'), col('tagline'), col('source'), col('status')]
  const clean = text.replace(/\s+/g, ' ').replace(/\|/g, '/').replace(/"/g, "'").trim()
  for (let i = at + 1; i < lines.length && lines[i].trim().startsWith('|'); i++) {
    if (isSeparator(lines[i])) continue
    const c = realign(cells(lines[i]), header.length, t)
    if ((c[n] ?? '').toLowerCase() !== network.toLowerCase()) continue
    while (c.length < header.length) c.push('')
    if (t >= 0) c[t] = `"${clean}"`
    if (s >= 0) c[s] = 'Pasted by you'
    if (st >= 0) c[st] = 'Found'
    // Rewriting the row fixes any stray pipes in the other cells too.
    lines[i] = `| ${c.map(escapeCell).join(' | ')} |`
    return lines.join('\n')
  }
  return null
}
