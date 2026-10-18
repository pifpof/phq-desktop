import { readFile, writeFile } from 'fs/promises'
import type { Affects, Change, ChangeInput, ChangeStatus } from '@shared/changes'
import type { ArticleFrontMatter } from '@shared/wiki-types'
import { PLAYBOOK_SECTION_ARTICLES } from '@shared/wiki-views'
import { addBacklinks } from '../research/article-output'
import { replaceEmDashes } from '../research/postprocess'
import { slugsForTask, specFor, ARTICLE_MAP } from './article-map'
import { renderArticle } from './article'
import { stringField, stringList, stringifyDoc } from './frontmatter'
import { writeIndexes } from './index-gen'
import { link, linkedSlugs, parseLinks } from './links'
import { appendLog } from './log'
import { freeRel, isoDay, rawRel, safeJoin, slugify } from './paths'
import { scanWiki, type WikiFile } from './scan'

/**
 * Changes (REQUIREMENTS-v3.1 2, 3, 6): written as decision articles with a Status line, so the
 * format contract and the skill pack stay valid. Pending changes wait for a regeneration; applied
 * ones (and legacy "Decision:" articles) must be respected by every later generation.
 */

const oneLine = (s: string): string => replaceEmDashes(s.replace(/\s+/g, ' ').trim())
const para = (s: string): string => replaceEmDashes(s.trim()).replace(/\r\n/g, '\n')

/** The short name: the first sentence of "Change it to", cut at a word near 70 characters. */
export function shortName(changeTo: string): string {
  const first = oneLine(changeTo.split(/\n/)[0] ?? '')
  const sentence = /^(.{8,}?[.!?])(\s|$)/.exec(first)?.[1] ?? first
  const s = sentence.replace(/[.!?]+$/, '')
  if (s.length <= 70) return s || 'Change'
  const cut = s.slice(0, 71)
  return `${cut.slice(0, cut.lastIndexOf(' ') > 30 ? cut.lastIndexOf(' ') : 70)}...`
}

interface Page {
  slug: string
  title: string
  path: string
}

function pagesBySlug(files: WikiFile[]): Map<string, Page> {
  const out = new Map<string, Page>()
  for (const f of files)
    if (f.kind === 'article' && f.dir !== 'wiki/theses' && !out.has(f.name))
      out.set(f.name, { slug: f.name, title: stringField(f.data?.title) || f.name, path: f.rel })
  return out
}

/** Pages that feed on `page` (article map dependsOn, one level) and the outputs that include it. */
export function affectsOf(page: string, files: WikiFile[]): Affects {
  const pages = pagesBySlug(files)
  const fed = (dep: string): boolean =>
    dep.endsWith('*') ? page.startsWith(dep.slice(0, -1)) : dep === page
  const out = new Map<string, Page>()
  for (const spec of ARTICLE_MAP) {
    if (!spec.dependsOn.some(fed)) continue
    const matches = spec.pattern
      ? [...pages.values()].filter((p) => p.slug.startsWith(spec.slug))
      : [pages.get(spec.slug)].filter((p): p is Page => !!p)
    for (const p of matches) if (p.slug !== page) out.set(p.slug, p)
  }
  const inPlaybook = Object.values(PLAYBOOK_SECTION_ARTICLES).some(
    (s) => s.slug === page || (s.prefix && page.startsWith(s.prefix))
  )
  const messagingTasks = [
    'website-positioning',
    'social-taglines',
    'playbook-05-statement',
    'playbook-02-icp',
    'playbook-03-value',
    'playbook-04-moat',
    'playbook-06-competitive'
  ]
  const inMessaging = messagingTasks.some((t) =>
    slugsForTask(t).some((s) => (s.pattern ? page.startsWith(s.slug) : s.slug === page))
  )
  return {
    pages: [...out.values()].map((p) => ({ slug: p.slug, title: p.title })),
    outputs: [
      ...(inPlaybook ? ['Positioning Playbook'] : []),
      ...(inMessaging ? ['Messaging Analysis'] : [])
    ]
  }
}

// ---------------------------------------------------------------------------------------------
// Reading

const STATUS_RE =
  /^\*\*Status:\*\*\s*(Pending|Applied|Withdrawn|Replaced)\b\s*(\d{4}-\d{2}-\d{2})?(.*)$/m

function section(body: string, heading: string): string {
  const re = new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm')
  return (re.exec(body)?.[1] ?? '').trim()
}

/** A decision article as a change, or null for anything else. */
export function parseChange(f: WikiFile, pages: Map<string, Page>): Change | null {
  if (!/^decision-\d{4}-\d{2}-\d{2}-/.test(f.name) || f.kind !== 'article' || !f.data) return null
  const title = stringField(f.data.title) || f.name
  const created = stringField(f.data.created) || f.name.slice(9, 19)
  const status = STATUS_RE.exec(f.body)
  const raw = new Map<string, string>()
  const sources = stringList(f.data.sources)
  const titleOf = (slug: string): string => pages.get(slug)?.title ?? slug
  const linksIn = (text: string): string[] =>
    linkedSlugs(f.rel, text).filter((s) => s !== f.name && !s.startsWith('decision-'))

  if (!status) {
    // A v2 decision: "What was decided", "Why", "What it affects". Treated as applied.
    const affects = linksIn(section(f.body, 'What it affects'))
    return {
      id: f.name,
      path: f.rel,
      name: title.replace(/^(Decision|Change):\s*/i, ''),
      page: affects[0] ?? '',
      pageTitle: affects[0] ? titleOf(affects[0]) : '',
      section: null,
      quote: '',
      why: section(f.body, 'Why'),
      changeTo: section(f.body, 'What was decided'),
      basedOn: sources.map((p) => ({ path: p, title: raw.get(p) ?? p.split('/').pop()! })),
      affects: affects.slice(1).map((s) => ({ slug: s, title: titleOf(s) })),
      status: 'applied',
      statusDate: created,
      statusRef: affects[0] ?? '',
      created,
      legacy: true,
      private: stringList(f.data.tags).includes('private')
    }
  }

  const what = section(f.body, 'What to change')
  const page = linksIn(/^Page:.*$/m.exec(what)?.[0] ?? '')[0] ?? ''
  const sectionLine = /^Section:\s*(.+)$/m.exec(what)?.[1]?.trim() ?? ''
  const quote = what
    .split('\n')
    .filter((l) => l.startsWith('>'))
    .map((l) => l.replace(/^>\s?/, ''))
    .join('\n')
    .trim()
  const kind = status[1].toLowerCase() as ChangeStatus
  const ref =
    kind === 'applied' || kind === 'replaced'
      ? (parseLinks(f.rel, status[3] ?? '').find((l) => l.slug)?.slug ?? '')
      : ''
  const basedTitles = new Map<string, string>()
  for (const l of parseLinks(f.rel, section(f.body, 'Based on')))
    if (l.path) basedTitles.set(l.path, /\[([^\]]+)\]/.exec(l.text)?.[1] ?? l.path)
  return {
    id: f.name,
    path: f.rel,
    name: title.replace(/^(Change|Decision):\s*/i, ''),
    page,
    pageTitle: page ? titleOf(page) : '',
    section: !sectionLine || /^the whole page$/i.test(sectionLine) ? null : sectionLine,
    quote,
    why: section(f.body, 'Why'),
    changeTo: section(f.body, 'Change it to'),
    basedOn: sources.map((p) => ({ path: p, title: basedTitles.get(p) ?? p.split('/').pop()! })),
    affects: linksIn(section(f.body, 'Affects'))
      .filter((s) => s !== page)
      .map((s) => ({ slug: s, title: titleOf(s) })),
    status: kind,
    statusDate: status[2] ?? created,
    statusRef: ref,
    created,
    legacy: false,
    private: stringList(f.data.tags).includes('private')
  }
}

export async function listChanges(root: string, files?: WikiFile[]): Promise<Change[]> {
  const all = files ?? (await scanWiki(root))
  const pages = pagesBySlug(all)
  return all
    .map((f) => parseChange(f, pages))
    .filter((c): c is Change => !!c)
    .sort((a, b) => b.created.localeCompare(a.created) || b.id.localeCompare(a.id))
}

// ---------------------------------------------------------------------------------------------
// Writing

function statusLine(status: ChangeStatus, path: string, date: string, ref: Page | null): string {
  if (status === 'pending') return '**Status:** Pending'
  if (status === 'withdrawn') return `**Status:** Withdrawn ${date}`
  const word = status === 'applied' ? 'Applied' : 'Replaced'
  const join = status === 'applied' ? 'to' : 'by'
  return ref
    ? `**Status:** ${word} ${date} ${join} ${link(path, ref)}`
    : `**Status:** ${word} ${date}`
}

interface RenderArgs {
  rel: string
  name: string
  page: Page
  input: ChangeInput
  affects: Page[]
  basedOn: { path: string; title: string; private: boolean }[]
  created: string
  updated: string
}

function render(a: RenderArgs): string {
  const anyPrivate = a.basedOn.some((b) => b.private)
  const frontMatter: ArticleFrontMatter = {
    title: `Change: ${a.name}`,
    category: 'reference',
    ...(a.basedOn.length ? { sources: a.basedOn.map((b) => b.path) } : {}),
    created: a.created,
    updated: a.updated,
    tags: ['decision', slugify(a.page.slug), ...(anyPrivate ? ['private'] : [])],
    aliases: [],
    confidence: 'high',
    volatility: 'cold',
    verified: a.updated,
    'compiled-from': a.basedOn.length ? 'mixed' : 'conversation',
    summary: oneLine(`${a.page.title}: ${a.name}`)
  }
  const what = [
    `Page: ${link(a.rel, a.page)}`,
    `Section: ${a.input.section ? oneLine(a.input.section) : 'The whole page'}`,
    ...(a.input.quote.trim()
      ? [
          '',
          ...para(a.input.quote)
            .split('\n')
            .map((l) => `> ${l}`)
        ]
      : [])
  ]
  const sections = [
    statusLine('pending', a.rel, a.updated, null),
    '',
    '## What to change',
    '',
    ...what,
    '',
    '## Why',
    '',
    para(a.input.why),
    '',
    '## Change it to',
    '',
    para(a.input.changeTo),
    '',
    '## Based on',
    '',
    ...(a.basedOn.length
      ? a.basedOn.map(
          (b) => `- [${oneLine(b.title).replace(/[[\]]/g, '')}](${relRaw(a.rel, b.path)})`
        )
      : ['- Nothing yet.']),
    '',
    '## Affects',
    '',
    ...[a.page, ...a.affects].map((p) => `- ${link(a.rel, p)}`)
  ].join('\n')
  return renderArticle({
    path: a.rel,
    frontMatter,
    abstract: `The founder asked to change ${a.page.title}${
      a.input.section ? ` (${oneLine(a.input.section)})` : ''
    }: ${oneLine(a.input.changeTo).slice(0, 240)}`,
    sections,
    seeAlso: [a.page, ...a.affects].map((p) => ({ target: p, note: '' })),
    sources: []
  })
}

/** A raw path relative to a wiki/references/ article. */
const relRaw = (from: string, to: string): string =>
  `${'../'.repeat(from.split('/').length - 1)}${to}`

/** Notes pasted in the dialog become a private raw note (raw is never edited afterwards). */
async function writeNotes(root: string, page: Page, notes: string, date: string): Promise<string> {
  const rel = await freeRel(root, rawRel('notes', date, `change-notes-${page.slug}`.slice(0, 60)))
  const title = `Notes for a change to ${page.title}`
  await writeFile(
    safeJoin(root, rel),
    stringifyDoc(
      'raw',
      {
        title,
        source: 'Pasted by the founder in PositioningHQ',
        type: 'notes',
        ingested: date,
        tags: ['private', 'change-notes'],
        summary: `Notes the founder pasted as evidence for a change to ${page.title}. Private.`
      },
      `# ${title}\n\n${para(notes)}`
    ),
    { flag: 'wx' }
  )
  await appendLog(root, 'ingest', `notes pasted for a change (${rel})`, date)
  return rel
}

async function resolveInput(
  root: string,
  input: ChangeInput,
  date: string
): Promise<{ page: Page; affects: Page[]; basedOn: RenderArgs['basedOn'] }> {
  const files = await scanWiki(root)
  const pages = pagesBySlug(files)
  const page = pages.get(input.page)
  if (!page) throw new Error('That page is not in the wiki.')
  const raw = new Map(files.filter((f) => f.kind === 'raw').map((f) => [f.rel, f]))
  const paths = [...new Set(input.basedOn)].filter((p) => raw.has(p))
  if (input.notes.trim()) {
    const rel = await writeNotes(root, page, input.notes, date)
    paths.push(rel)
  }
  const after = input.notes.trim() ? await scanWiki(root) : files
  const rawNow = new Map(after.filter((f) => f.kind === 'raw').map((f) => [f.rel, f]))
  return {
    page,
    affects: [...new Set(input.affects)]
      .filter((s) => s !== page.slug)
      .map((s) => pages.get(s))
      .filter((p): p is Page => !!p),
    basedOn: paths.map((p) => {
      const f = rawNow.get(p)
      return {
        path: p,
        title: stringField(f?.data?.title) || p.split('/').pop()!,
        private: stringList(f?.data?.tags).includes('private')
      }
    })
  }
}

/** Saves a new pending change right away (REQUIREMENTS-v3.1 3.3). */
export async function createChange(
  root: string,
  input: ChangeInput,
  date: string = isoDay()
): Promise<Change> {
  const { page, affects, basedOn } = await resolveInput(root, input, date)
  const name = shortName(input.changeTo)
  const base = `decision-${date}-${slugify(name, 'change').slice(0, 50).replace(/-+$/, '')}`
  const rel = await freeRel(root, `wiki/references/${base}.md`)
  await writeFile(
    safeJoin(root, rel),
    render({ rel, name, page, input, affects, basedOn, created: date, updated: date }),
    { flag: 'wx' }
  )
  await addBacklinks(root, [rel])
  await appendLog(root, 'change', `requested: ${name} (${page.title})`, date)
  await writeIndexes(root)
  return (await findChange(root, rel.split('/').pop()!.replace(/\.md$/, '')))!
}

export async function findChange(root: string, id: string): Promise<Change | null> {
  return (await listChanges(root)).find((c) => c.id === id) ?? null
}

/** Rewrites a pending change in place (Edit). */
export async function updateChange(
  root: string,
  id: string,
  input: ChangeInput,
  date: string = isoDay()
): Promise<Change> {
  const current = await findChange(root, id)
  if (!current) throw new Error('That change is not in the wiki.')
  if (current.status !== 'pending') throw new Error('Only a waiting change can be edited.')
  const { page, affects, basedOn } = await resolveInput(root, input, date)
  const name = shortName(input.changeTo)
  await writeFile(
    safeJoin(root, current.path),
    render({
      rel: current.path,
      name,
      page,
      input,
      affects,
      basedOn,
      created: current.created,
      updated: date
    })
  )
  await addBacklinks(root, [current.path])
  await appendLog(root, 'change', `edited: ${name} (${page.title})`, date)
  await writeIndexes(root)
  return (await findChange(root, id))!
}

/**
 * Sets the Status line (and `updated`) without touching the rest of the article. `ref` is the
 * page it was applied to, or the change that replaced it.
 */
export async function setChangeStatus(
  root: string,
  id: string,
  status: Exclude<ChangeStatus, 'pending'>,
  ref: string | null = null,
  date: string = isoDay()
): Promise<Change> {
  const current = await findChange(root, id)
  if (!current) throw new Error('That change is not in the wiki.')
  if (current.legacy) throw new Error('This change was recorded before changes had a status.')
  const files = await scanWiki(root)
  const target = ref ? (pagesBySlug(files).get(ref) ?? null) : null
  const abs = safeJoin(root, current.path)
  const text = await readFile(abs, 'utf8')
  const line = statusLine(status, current.path, date, target)
  // Only the Status line and the front matter's `updated` date change.
  const end = text.indexOf('\n---', 4)
  const head = text.slice(0, end).replace(/^updated:.*$/m, `updated: ${date}`)
  await writeFile(abs, head + text.slice(end).replace(/^\*\*Status:\*\*.*$/m, line))
  const verb = { applied: 'applied', withdrawn: 'withdrawn', replaced: 'replaced' }[status]
  await appendLog(
    root,
    'change',
    `${verb}: ${current.name} (${current.pageTitle || current.page})`,
    date
  )
  await writeIndexes(root)
  return (await findChange(root, id))!
}

/** Changes to apply or respect for a page (REQUIREMENTS-v3.1 4.1). */
export function changesForPage(changes: Change[], page: string) {
  const touches = (c: Change): boolean => c.page === page || c.affects.some((a) => a.slug === page)
  return {
    pending: changes.filter((c) => c.status === 'pending' && c.page === page),
    fromOthers: changes.filter(
      (c) => c.status === 'pending' && c.page !== page && c.affects.some((a) => a.slug === page)
    ),
    respected: changes.filter((c) => c.status === 'applied' && touches(c))
  }
}

export const isChangeSlug = (slug: string): boolean => specFor(slug)?.slug === 'decision-'

/** The page's H2 sections (not See Also or Sources), each with its first sentence. */
export function pageSections(body: string): { heading: string; excerpt: string }[] {
  const out: { heading: string; excerpt: string }[] = []
  const parts = body.split(/^## /m).slice(1)
  for (const part of parts) {
    const [first, ...rest] = part.split('\n')
    const heading = first.trim()
    if (!heading || /^(See Also|Sources)$/i.test(heading)) continue
    const text = rest
      .join(' ')
      .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[#*_>`|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const sentence = /^(.{20,160}?[.!?])(\s|$)/.exec(text)?.[1] ?? text.slice(0, 140)
    out.push({ heading, excerpt: sentence })
  }
  return out
}
