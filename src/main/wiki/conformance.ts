import { readFile, stat } from 'fs/promises'
import { join, relative, resolve, sep } from 'path'
import { FRESHNESS_CHECK, type CheckReport, type Finding, type Severity } from '@shared/conformance'
import { FORMAT_VERSION, KEYS } from '@shared/wiki-types'
import { specFor } from './article-map'
import { parseDoc, stringField, stringList } from './frontmatter'
import { parseLinks } from './links'
import {
  extractMarkdownLinks,
  isLocalMarkdownLink,
  resolveLinkTarget,
  resolveSourceRef,
  runLintPort,
  type LintDoc
} from './lint-port'
import { isoDay } from './paths'
import { scanWiki } from './scan'

/**
 * The app's conformance check (REQUIREMENTS-v2 section 5): llm-wiki's lint (ported) plus the
 * PositioningHQ spec checks (WIKI-FORMAT-SPEC section 12 items 2 to 5, and the rules the
 * official script leaves to its agentic lint: reciprocal See Also, the front matter whitelist).
 */

const ORDER: Record<Severity, number> = { critical: 0, warning: 1, suggestion: 2, info: 3 }

export interface WikiFormat {
  /** config.md declares a PositioningHQ format_version. */
  phq: boolean
  version: number | null
}

export async function readFormat(root: string): Promise<WikiFormat> {
  try {
    const doc = parseDoc(await readFile(join(root, 'config.md'), 'utf8'))
    const v = doc?.data.format_version
    if (typeof v === 'number') return { phq: true, version: v }
    if (v !== undefined) return { phq: true, version: null }
  } catch {
    /* no config */
  }
  return { phq: false, version: null }
}

const sectionBody = (body: string, heading: string): string => {
  const m = new RegExp(`^## ${heading}\\s*$`, 'm').exec(body)
  if (!m) return ''
  const rest = body.slice(m.index + m[0].length)
  const next = /^## /m.exec(rest)
  return next ? rest.slice(0, next.index) : rest
}

const slugOf = (rel: string): string => rel.split('/').pop()!.replace(/\.md$/, '')

/** Spec checks for a PositioningHQ wiki. */
async function phqChecks(
  root: string,
  format: WikiFormat,
  documents: Map<string, LintDoc>
): Promise<Finding[]> {
  const out: Finding[] = []
  const add = (
    severity: Severity,
    check: string,
    path: string,
    message: string,
    hint?: string,
    fixable = false
  ): void => {
    out.push({ check, severity, path, message, hint, fixable, origin: 'phq' })
  }

  if (format.version === null)
    add('critical', 'S13', 'config.md', 'format_version in config.md is not a number.')
  else if (format.version > FORMAT_VERSION)
    add(
      'critical',
      'S13',
      'config.md',
      `This wiki uses format version ${format.version}; this app supports up to ${FORMAT_VERSION}.`,
      'Update PositioningHQ to edit this wiki.'
    )

  try {
    await readFile(join(root, 'README.md'))
  } catch {
    add(
      'warning',
      'S9',
      'README.md',
      'README.md is missing. Other AI tools read it first.',
      undefined,
      true
    )
  }

  const docs = [...documents.values()]
  const raw = new Map(docs.filter((d) => d.rel.startsWith('raw/')).map((d) => [d.rel, d]))
  const articles = docs.filter(
    (d) => d.rel.startsWith('wiki/') && !d.rel.startsWith('wiki/theses/')
  )
  const bySlug = new Map(articles.map((a) => [slugOf(a.rel), a]))

  for (const a of articles) {
    const fm = a.frontmatter
    const slug = slugOf(a.rel)

    // 12.2: known slugs live in their category's folder. Unknown slugs are allowed (other
    // llm-wiki tools add articles) but noted.
    const spec = specFor(slug)
    if (!spec) add('info', 'S12.2', a.rel, `"${slug}" is not in the PositioningHQ article map.`)
    else if (stringField(fm.category) && fm.category !== spec.category)
      add('warning', 'S12.2', a.rel, `"${slug}" should be a ${spec.category} article.`)

    // 4.2: no keys outside the spec (llm-wiki C13); our always-written keys present.
    const unknown = Object.keys(fm).filter((k) => !(KEYS.article as readonly string[]).includes(k))
    if (unknown.length)
      add(
        'warning',
        'C13',
        a.rel,
        `Unknown front matter keys: ${unknown.join(', ')}.`,
        'Keep generator details out of the wiki.'
      )
    const missing = ['aliases', 'confidence', 'volatility', 'verified'].filter((k) => !(k in fm))
    if (missing.length)
      add('suggestion', 'S4.2', a.rel, `Missing recommended keys: ${missing.join(', ')}.`)

    // 12.3 and 12.4: sources resolve inside raw/; private sources make a private article.
    let citesPrivate = false
    for (const s of stringList(fm.sources)) {
      const resolved = await resolveSourceRef(root, join(root, a.rel), s, true)
      if (!resolved) continue
      const rel = relative(resolve(root), resolved).split(sep).join('/')
      if (!rel.startsWith('raw/')) {
        add('warning', 'S12.3', a.rel, `Source is not a raw file: ${s}.`)
        continue
      }
      if (stringList(raw.get(rel)?.frontmatter.tags).includes('private')) citesPrivate = true
    }
    if (citesPrivate && !stringList(fm.tags).includes('private'))
      add(
        'warning',
        'S12.4',
        a.rel,
        'Cites a private source but is not tagged private.',
        'Add the private tag so web tools never receive it.',
        true
      )

    // 12.5: cross-references use the two-form link and point at real articles.
    for (const l of parseLinks(a.rel, a.body)) {
      const isTwoForm = l.slug !== null && l.path !== null
      if (l.slug && !bySlug.has(l.slug))
        add('warning', 'S12.5', a.rel, `Links to an article that does not exist: [[${l.slug}]].`)
      else if (!isTwoForm && l.slug)
        add('warning', 'S12.5', a.rel, `[[${l.slug}]] has no markdown link next to it.`)
      else if (!isTwoForm && l.path?.startsWith('wiki/'))
        add('warning', 'S12.5', a.rel, `Link to ${l.path} has no [[wikilink]] form.`)
    }

    // llm-wiki C4: See Also is reciprocal.
    for (const l of parseLinks(a.rel, sectionBody(a.body, 'See Also'))) {
      const target = l.slug ? bySlug.get(l.slug) : undefined
      if (!target) continue
      const back = parseLinks(target.rel, sectionBody(target.body, 'See Also')).some(
        (b) => b.slug === slug
      )
      if (!back)
        add(
          'warning',
          'C4',
          target.rel,
          `See Also does not link back to ${a.rel}.`,
          `Add ${slug} to its See Also.`
        )
    }

    if (slug.startsWith('competitor-') && !/^\*\*Category term:\*\*\s*\S/m.test(a.body))
      add(
        'info',
        'S6.3',
        a.rel,
        'No **Category term:** line. The playbook will use the competitor name.'
      )
  }

  // Raw front matter: spec keys only (llm-wiki allows its optional collection keys too).
  const rawExtra = new Set([
    'collection',
    'adapter',
    'upstream_id',
    'upstream_type',
    'revision',
    'sha',
    'canonical_url',
    'content_format',
    'license',
    'authors',
    'categories',
    'outlinks',
    'fetched'
  ])
  for (const r of raw.values()) {
    const unknown = Object.keys(r.frontmatter).filter(
      (k) => !(KEYS.raw as readonly string[]).includes(k) && !rawExtra.has(k)
    )
    if (unknown.length)
      add('warning', 'C13', r.rel, `Unknown front matter keys: ${unknown.join(', ')}.`)
  }

  // 4.5 and 12.3: outputs have spec front matter and cite wiki articles.
  for (const f of (await scanWiki(root)).filter((x) => x.kind === 'output')) {
    if (!f.data) {
      add('warning', 'S4.5', f.rel, 'Output has no front matter.')
      continue
    }
    const missing = ['title', 'type', 'created', 'updated', 'summary', 'sources'].filter(
      (k) => !f.data![k] || (Array.isArray(f.data![k]) && !(f.data![k] as unknown[]).length)
    )
    if (missing.length)
      add('warning', 'S4.5', f.rel, `Missing front matter: ${missing.join(', ')}.`)
    for (const s of stringList(f.data.sources)) {
      if (!s.startsWith('wiki/') || !documents.has(s))
        add('warning', 'S12.3', f.rel, `Source is not a wiki article: ${s}.`)
    }
  }

  // Section 5: the master index's links (Start here, navigation) resolve.
  try {
    const master = await readFile(join(root, '_index.md'), 'utf8')
    for (const link of extractMarkdownLinks(master)) {
      if (!isLocalMarkdownLink(link)) continue
      try {
        await stat(resolveLinkTarget(root, link))
      } catch {
        add(
          'warning',
          'S5',
          '_index.md',
          `Master index links to a missing file: ${link}.`,
          undefined,
          true
        )
      }
    }
  } catch {
    /* reported by C1 */
  }
  return out
}

/** Runs every check. `today` (YYYY-MM-DD) is the date used for freshness. */
export async function checkWiki(root: string, today: string = isoDay()): Promise<CheckReport> {
  const port = await runLintPort(root, today)
  const format = await readFormat(root)
  const findings = [
    ...port.findings,
    ...(format.phq ? await phqChecks(root, format, port.documents) : [])
  ].sort(
    (a, b) =>
      ORDER[a.severity] - ORDER[b.severity] ||
      a.path.localeCompare(b.path) ||
      a.message.localeCompare(b.message)
  )
  const counts = { critical: 0, warning: 0, suggestion: 0, info: 0 }
  for (const f of findings) counts[f.severity]++
  const stale = findings.filter((f) => f.check === FRESHNESS_CHECK && f.severity === 'warning')
  return {
    checkedAt: new Date().toISOString(),
    today,
    findings,
    counts,
    stale: stale.length,
    ok: counts.critical === 0 && counts.warning === stale.length
  }
}
