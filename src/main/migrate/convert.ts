import { randomUUID } from 'crypto'
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { basename, extname, join } from 'path'
import matter from 'gray-matter'
import { emptyProfile, ProfileSchema, type Profile } from '@shared/profile'
import { INPUT_CATEGORIES, type InputCategory } from '@shared/workspace'
import type { ArticleFrontMatter, Confidence } from '@shared/wiki-types'
import { categoryTag, readRecords, type InputRecord } from '../ingest/files-to-raw'
import { cleanText, extractText_ } from '../ingest/extract'
import { normalizeSourceUrl, sourceTagger } from '../ingest/citations-to-raw'
import { pageName, pageType } from '../ingest/website-to-raw'
import { replaceEmDashes } from '../research/postprocess'
import { writeSocialNotes } from '../research/executor'
import { PLAYBOOK_KIND } from '../research/assemble-playbook'
import { stateDir, writeJsonAtomic, forgetWorkspace } from '../state/app-state'
import { renderArticle } from '../wiki/article'
import { specFor } from '../wiki/article-map'
import { maxConfidence, type SourceInfo } from '../wiki/confidence'
import { stringifyDoc } from '../wiki/frontmatter'
import { writeIndexes } from '../wiki/index-gen'
import { appendLog } from '../wiki/log'
import { articleRel, freeRel, isoDay, outputRel, rawRel, safeJoin, slugify } from '../wiki/paths'
import { createSkeleton } from '../wiki/skeleton'
import { readVaultConfig } from '../workspace/vault-config'
import { writeProfile } from '../workspace/profile'
import {
  splitMoats,
  splitValueDrivers,
  promote,
  sectionBody,
  type SplitPart
} from './split-playbook'
import type { ReportEntry } from './report'

/**
 * Converts a v1 app workspace, or an old skill-pack vault, into a v2 wiki in place
 * (REQUIREMENTS-v2 6.2 and 6.3). Deterministic. It only adds files: the old folders are left for
 * the founder to remove (or move aside) after the result has been checked.
 */

export interface ConvertOptions {
  /** 'convert' carries everything over; 'rebuild' keeps the profile and files only. */
  mode: 'convert' | 'rebuild'
  appVersion: string
  date?: string
  /** Splits a section whose headings can't be parsed (no web tools). Optional. */
  aiSplit?: (section: string, kind: 'value-drivers' | 'moats') => Promise<SplitPart[] | null>
  onStep?: (step: string) => void
}

export interface ConvertResult {
  report: ReportEntry[]
  articles: string[]
  /** The v1 folders and files to remove (or move aside) once the founder agrees. */
  legacy: string[]
}

/** Every top-level entry that belongs to the v1 layout. */
export const LEGACY_ENTRIES = ['memory', 'inputs', 'outputs', 'vault.config.md', '.positioninghq']

interface V1Doc {
  rel: string
  data: Record<string, unknown>
  body: string
  created: string
}

const exists = async (p: string): Promise<boolean> => {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function readV1(root: string, rel: string): Promise<V1Doc | null> {
  try {
    const parsed = matter(await readFile(join(root, rel), 'utf8'))
    const data = JSON.parse(JSON.stringify(parsed.data)) as Record<string, unknown>
    const c = typeof data.created === 'string' ? new Date(data.created) : null
    return {
      rel,
      data,
      body: parsed.content,
      created: c && !Number.isNaN(c.getTime()) ? isoDay(c) : ''
    }
  } catch {
    return null
  }
}

async function list(root: string, rel: string): Promise<string[]> {
  try {
    return (await readdir(join(root, rel), { withFileTypes: true }))
      .filter((e) => e.isFile() && !e.name.startsWith('.'))
      .map((e) => `${rel}/${e.name}`)
      .sort()
  } catch {
    return []
  }
}

async function walk(root: string, rel = ''): Promise<string[]> {
  const out: string[] = []
  let entries
  try {
    entries = await readdir(join(root, rel), { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const child = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...(await walk(root, child)))
    else if (e.isFile()) out.push(child)
  }
  return out
}

const oneLine = (s: string): string => replaceEmDashes(s.replace(/\s+/g, ' ').trim())
const urls = (d: V1Doc | null): string[] =>
  Array.isArray(d?.data.sources)
    ? (d!.data.sources as unknown[]).filter(
        (u): u is string => typeof u === 'string' && /^https?:\/\//.test(u)
      )
    : []

/** The body without its title and v1's own Sources list. */
const cleanV1 = (body: string): string =>
  replaceEmDashes(
    body
      .replace(/^#\s+.*\n+/, '')
      .replace(/\n#{2,3}\s+Sources\s*\n[\s\S]*$/i, '')
      .trim()
  )

/** First real paragraph, for the abstract; first sentence, for the summary. */
function abstractOf(md: string): string {
  for (const block of md.split(/\n\s*\n/)) {
    const t = block.trim()
    if (!t || /^(#|\||-|\*\s|\d+\.|```|>)/.test(t)) continue
    const text = oneLine(t.replace(/\*\*/g, ''))
    if (text.length >= 40) return text.length > 700 ? `${text.slice(0, 697)}...` : text
  }
  return ''
}
const firstSentence = (s: string): string => {
  const m = /^(.{20,220}?[.!?])(\s|$)/.exec(s)
  return m ? m[1] : s.slice(0, 220)
}

export async function convertV1(root: string, o: ConvertOptions): Promise<ConvertResult> {
  const date = o.date ?? isoDay()
  const report: ReportEntry[] = []
  const articles: string[] = []
  const done = new Set<string>()
  const note = (v1: string, to: string[], why?: string): void => {
    done.add(v1)
    report.push({ v1, to, ...(why ? { why } : {}) })
  }
  const step = (s: string): void => o.onStep?.(s)

  // --- Profile and identity -------------------------------------------------------------
  step('Reading your profile')
  let profile: Profile | null = null
  try {
    const p = ProfileSchema.safeParse(
      JSON.parse(await readFile(join(root, '.positioninghq/profile.json'), 'utf8'))
    )
    if (p.success) profile = p.data
  } catch {
    /* a skill-pack vault has none */
  }
  if (!profile) {
    const vault = await readVaultConfig(root)
    profile = emptyProfile()
    profile.company.name = vault?.name ?? ''
    profile.company.website = vault?.website ?? ''
    profile.onboarding = { step: 'start', complete: true }
  }
  const company = profile.company.name || 'Company'
  forgetWorkspace(root)
  await createSkeleton(root, { company, workspaceId: randomUUID(), created: date })
  const state = await stateDir(root)

  // --- App state: runs and chats --------------------------------------------------------
  step('Moving run history and chats')
  for (const sub of ['runs', 'chats']) {
    for (const f of await list(root, `.positioninghq/${sub}`)) {
      if (!f.endsWith('.json')) continue
      await mkdir(join(state, sub), { recursive: true })
      await copyFile(join(root, f), join(state, sub, basename(f)))
      note(f, [`app data: ${sub}/${basename(f)}`])
    }
  }
  for (const f of ['.positioninghq/workspace.json', '.positioninghq/profile.json'])
    if (await exists(join(root, f)))
      note(
        f,
        ['app data'],
        f.endsWith('profile.json') ? undefined : 'Replaced by the new workspace record.'
      )

  const tagger = sourceTagger({ ownSite: profile.company.website })
  const raw = new Map<string, SourceInfo & { title: string }>()
  const addRaw = (rel: string, source: string, tags: string[], title: string): void => {
    raw.set(rel, { path: rel, source, tags, title })
  }
  const taken = new Set<string>()
  const free = async (rel: string): Promise<string> => {
    const r = await freeRel(root, rel, taken)
    taken.add(r)
    return r
  }
  const writeRaw = async (
    rel: string,
    fm: Record<string, unknown>,
    body: string
  ): Promise<void> => {
    await writeFile(safeJoin(root, rel), stringifyDoc('raw', fm, body), { flag: 'wx' })
    addRaw(rel, String(fm.source), fm.tags as string[], String(fm.title))
  }

  // --- User files -------------------------------------------------------------------------
  step('Carrying over your files')
  const records: InputRecord[] = [...(await readRecords(root))]
  const v1Inputs = new Map<string, string>() // v1 extracted path -> raw path
  let anyPrivate = false
  for (const category of INPUT_CATEGORIES) {
    for (const f of await list(root, `inputs/${category}`)) {
      const name = basename(f)
      const processedDir = join(root, 'inbox', '.processed')
      await mkdir(processedDir, { recursive: true })
      let kept = name
      for (let n = 2; await exists(join(processedDir, kept)); n++)
        kept = `${basename(name, extname(name))}-${n}${extname(name)}`
      await copyFile(join(root, f), join(processedDir, kept))
      const extractedRel = `memory/research/inputs-extracted/${category}/${name}.md`
      const extracted = await readV1(root, extractedRel)
      let text = extracted ? extracted.body.replace(/\n\n\[Truncated:[^\]]*\]\s*$/, '').trim() : ''
      if (!text) {
        try {
          text = replaceEmDashes(cleanText(await extractText_(join(root, f))))
        } catch {
          text = ''
        }
      }
      const size = (await stat(join(root, f))).size
      if (!text) {
        records.push({
          name: kept,
          category,
          size,
          readable: false,
          raw: null,
          status: 'failed',
          location: 'processed'
        })
        note(f, [`inbox/.processed/${kept}`], 'No readable text; kept, not used.')
        continue
      }
      const mtime = isoDay((await stat(join(root, f))).mtime)
      const type = extname(name).toLowerCase() === '.csv' ? 'data' : 'papers'
      const title = basename(name, extname(name))
      const rel = await free(rawRel(type, mtime, title))
      await writeRaw(
        rel,
        {
          title,
          source: `inbox/.processed/${kept}`,
          type,
          ingested: mtime,
          tags: ['private', categoryTag(category as InputCategory)],
          summary: `A file you added (${category}): ${name}. Private.`
        },
        `# ${title}\n\n${text}`
      )
      anyPrivate = true
      records.push({
        name: kept,
        category,
        size,
        readable: true,
        raw: rel,
        status: 'ok',
        location: 'processed'
      })
      v1Inputs.set(extractedRel, rel)
      note(f, [`inbox/.processed/${kept}`, rel])
      if (extracted) note(extractedRel, [rel])
    }
  }
  await writeJsonAtomic(join(state, 'inputs.json'), records)

  // --- Profile article --------------------------------------------------------------------
  await writeProfile(root, profile)
  if (await exists(join(root, 'memory/company-profile.md')))
    note('memory/company-profile.md', ['wiki/references/company-profile.md'])

  if (o.mode === 'rebuild') {
    step('Ready for new research')
    for (const f of await walk(root, 'memory'))
      if (!done.has(f)) note(f, [], 'Rebuild: replaced by new research.')
    await finish(root, date, 'v1 workspace converted for a rebuild (profile and files kept)')
    return { report, articles, legacy: await legacyPresent(root) }
  }

  // --- Website pages ------------------------------------------------------------------------
  step('Carrying over your website pages')
  const v1Pages = new Map<string, string>() // v1 page path -> raw path
  for (const f of await list(root, 'memory/research/website/pages')) {
    const d = await readV1(root, f)
    if (!d) continue
    const url = typeof d.data.url === 'string' ? d.data.url : (urls(d)[0] ?? '')
    const rel = await free(
      rawRel('articles', d.created || date, url ? pageName(url) : basename(f, '.md'))
    )
    const desc = typeof d.data.description === 'string' ? oneLine(d.data.description) : ''
    await writeRaw(
      rel,
      {
        title: oneLine(String(d.data.title ?? basename(f, '.md'))),
        source: url || 'Crawled by PositioningHQ v1',
        type: 'articles',
        ingested: d.created || date,
        tags: ['website', 'own-site', url ? pageType(url) : 'page'],
        summary: desc || `Page from the company website: ${oneLine(String(d.data.title ?? ''))}.`
      },
      replaceEmDashes(d.body.trim())
    )
    v1Pages.set(f, rel)
    note(f, [rel])
  }

  // --- Citation records for every URL a v1 document cites ------------------------------------
  step('Recording the sources v1 research cited')
  const docs = new Map<string, V1Doc>()
  for (const f of await walk(root, 'memory')) {
    if (!f.endsWith('.md') || f.includes('/website/pages/') || f.includes('/inputs-extracted/'))
      continue
    const d = await readV1(root, f)
    if (d) docs.set(f, d)
  }
  const cite = new Map<string, string>() // normalised URL -> raw path
  for (const d of docs.values()) {
    for (const u of urls(d)) {
      const key = normalizeSourceUrl(u)
      if (cite.has(key)) continue
      // A page v1 crawled stands for itself.
      const crawled = [...v1Pages.entries()].find(
        ([p]) => normalizeSourceUrl(String(docs.get(p)?.data.url ?? '')) === key
      )
      if (crawled) {
        cite.set(key, crawled[1])
        continue
      }
      const rel = await free(rawRel('articles', d.created || date, pageName(key)))
      const title = key.replace(/^https?:\/\//, '')
      await writeRaw(
        rel,
        {
          title,
          source: key,
          type: 'articles',
          ingested: d.created || date,
          tags: [...new Set(['web-citation', ...tagger(key)])],
          summary: 'Citation record carried over from v1 research. Not a full copy of the page.'
        },
        `# ${title}\n\nCitation record.\n\n- Cited in v1 research; excerpt not retained.`
      )
      cite.set(key, rel)
    }
  }
  // Pages crawled by v1 are known by their page path too.
  for (const [p, rel] of v1Pages) {
    const u = String((await readV1(root, p))?.data.url ?? '')
    if (u) cite.set(normalizeSourceUrl(u), rel)
  }

  const legacyNote = async (d: V1Doc, label: string): Promise<string> => {
    const rel = await free(rawRel('notes', d.created || date, `legacy-${label}`))
    const usedPrivate = (Array.isArray(d.data.inputs) ? (d.data.inputs as string[]) : []).some(
      (i) => i.includes('inputs-extracted')
    )
    await writeRaw(
      rel,
      {
        title: `${oneLine(String(d.data.title ?? label))} (from v1)`,
        // A label, not a path: the v1 file is gone once the old folders are removed.
        source: `PositioningHQ v1 file ${d.rel}`,
        type: 'notes',
        ingested: d.created || date,
        tags: ['legacy', ...(usedPrivate ? ['private'] : [])],
        summary: `The v1 document ${basename(d.rel)}, kept whole so converted articles have a real source.`
      },
      cleanV1(d.body)
    )
    return rel
  }

  /** Raw sources for a v1 document: its URLs, the pages and files it was shown, else a legacy copy. */
  const sourcesFor = async (d: V1Doc, label: string, depth = 0): Promise<string[]> => {
    const out = new Set<string>()
    for (const u of urls(d)) {
      const r = cite.get(normalizeSourceUrl(u))
      if (r) out.add(r)
    }
    for (const i of Array.isArray(d.data.inputs) ? (d.data.inputs as string[]) : []) {
      if (v1Pages.has(i)) out.add(v1Pages.get(i)!)
      else if (v1Inputs.has(i)) out.add(v1Inputs.get(i)!)
      else if (i === 'memory/research/website/index.md')
        for (const r of v1Pages.values()) out.add(r)
      else if (depth < 1 && docs.has(i))
        for (const r of await sourcesFor(docs.get(i)!, label, depth + 1)) out.add(r)
    }
    if (!out.size && depth === 0) out.add(await legacyNote(d, label))
    return [...out].sort()
  }

  const writeArticle = async (
    slug: string,
    title: string | null,
    d: { created: string },
    body: string,
    sources: string[],
    extra: {
      compiledFrom?: 'sources' | 'mixed'
      forcePrivate?: boolean
      categoryTerm?: string
    } = {}
  ): Promise<string> => {
    const spec = specFor(slug)!
    const rel = articleRel(spec.category, slug)
    const infos = sources.map((s) => raw.get(s)!).filter(Boolean)
    const isPrivate = extra.forcePrivate || infos.some((s) => s.tags.includes('private'))
    const sections = promote(body)
    const abstract =
      abstractOf(sections) ||
      `${title ?? spec.title} for ${company}, carried over from PositioningHQ v1.`
    const fm: ArticleFrontMatter = {
      title: title ?? spec.title,
      category: spec.category,
      ...(sources.length ? { sources } : {}),
      created: d.created || date,
      updated: date,
      tags: [slug.split('-')[0], 'migrated', ...(isPrivate ? ['private'] : [])],
      aliases: spec.aliases,
      confidence: (sources.length ? maxConfidence(infos) : 'low') as Confidence,
      volatility: spec.volatility,
      verified: d.created || date,
      'compiled-from': sources.length ? (extra.compiledFrom ?? 'sources') : 'mixed',
      summary: firstSentence(abstract)
    }
    const text = renderArticle({
      path: rel,
      frontMatter: fm,
      abstract,
      sections: extra.categoryTerm
        ? `**Category term:** ${extra.categoryTerm}\n\n${sections}`
        : sections,
      seeAlso: [],
      sources: sources.map((p) => ({ path: p, title: raw.get(p)?.title ?? p }))
    })
    await writeFile(safeJoin(root, rel), text)
    articles.push(rel)
    return rel
  }

  // --- Company research steps -----------------------------------------------------------------
  step('Converting the company research')
  const STEPS: [string, string][] = [
    ['01-company-overview', 'company-overview'],
    ['02-product-analysis', 'product-overview'],
    ['03-market-segment', 'market-segment'],
    ['04-customer-segment', 'customer-segment'],
    ['05-strengths', 'strengths'],
    ['06-weaknesses', 'weaknesses'],
    ['07-recent-developments', 'recent-developments'],
    ['09-synthesis', 'market-position-summary']
  ]
  for (const [file, slug] of STEPS) {
    const rel = `memory/company-research/steps/${file}.md`
    const d = docs.get(rel)
    if (!d) continue
    note(rel, [await writeArticle(slug, null, d, cleanV1(d.body), await sourcesFor(d, file))])
  }

  // --- Competitors ------------------------------------------------------------------------------
  step('Converting competitor profiles')
  const competitorRels: string[] = []
  for (const f of await list(root, 'memory/research/competitors')) {
    const d = docs.get(f)
    if (!d) continue
    const name = oneLine(String(d.data.title ?? basename(f, '.md')))
    const slug = `competitor-${slugify(name, 'competitor')}`
    const rel = await writeArticle(slug, name, d, cleanV1(d.body), await sourcesFor(d, slug))
    competitorRels.push(rel)
    note(f, [rel])
  }
  // Step 08 (one competitor in depth) is added to that competitor's article.
  const s08 = docs.get('memory/company-research/steps/08-competitive-analysis.md')
  if (s08) {
    const head = s08.body.slice(0, 1500).toLowerCase()
    const target = competitorRels.find((r) => {
      const n = r
        .split('/')
        .pop()!
        .replace(/^competitor-|\.md$/g, '')
        .replace(/-/g, ' ')
      return head.includes(n)
    })
    const legacy = await legacyNote(s08, '08-competitive-analysis')
    if (target) {
      const current = await readFile(safeJoin(root, target), 'utf8')
      const added = promote(cleanV1(s08.body))
      const merged = current.replace(
        /\n## Sources\n/,
        `\n${added}\n\n## Sources\n- [${raw.get(legacy)!.title}](../../${legacy})\n`
      )
      await writeFile(
        safeJoin(root, target),
        merged.replace(/^sources:\n/m, `sources:\n  - ${legacy}\n`)
      )
      note(s08.rel, [target, legacy])
    } else note(s08.rel, [legacy], 'No matching competitor profile; kept as a source.')
  }

  // --- Website positioning and social ---------------------------------------------------------
  step('Converting messaging research')
  const wp = docs.get('memory/research/website-positioning.md')
  if (wp)
    note(wp.rel, [
      await writeArticle(
        'current-messaging',
        null,
        wp,
        cleanV1(wp.body),
        await sourcesFor(wp, 'website-positioning')
      )
    ])
  const st = docs.get('memory/research/social-taglines.md')
  if (st) {
    const notesRel = await writeSocialNotes(root, st.body, st.created || date)
    for (const n of notesRel) addRaw(n, '', ['social'], n)
    const srcs = [...new Set([...notesRel, ...(await sourcesFor(st, 'social-taglines'))])].sort()
    note(st.rel, [
      await writeArticle('social-taglines', null, st, cleanV1(st.body), srcs),
      ...notesRel
    ])
  }
  for (const [rel, label] of [
    ['memory/research/social-profiles.md', 'social-profiles'],
    ['memory/research/competitors.md', 'competitor-list'],
    ['memory/research/proof-public.md', 'public-proof']
  ] as const) {
    const d = docs.get(rel)
    if (d)
      note(
        rel,
        [await legacyNote(d, label)],
        'Kept whole as a source; its links became citation records.'
      )
  }

  // --- The playbook ---------------------------------------------------------------------------
  step('Splitting the playbook into articles')
  const versions = (await list(root, 'memory/positioning-playbook/versions')).filter((f) =>
    f.endsWith('.md')
  )
  const currentPlaybook = (await list(root, 'memory/positioning-playbook')).find((f) =>
    f.endsWith('.md')
  )
  const latest = currentPlaybook ?? versions.at(-1)
  const playbookArticles: string[] = []
  if (latest) {
    const pd = docs.get(latest) ?? (await readV1(root, latest))!
    const legacyRel = await free(rawRel('notes', pd.created || date, 'legacy-positioning-playbook'))
    await writeRaw(
      legacyRel,
      {
        title: `Positioning Playbook: ${company} (from v1)`,
        source: `PositioningHQ v1 file ${latest}`,
        type: 'notes',
        ingested: pd.created || date,
        tags: ['legacy', ...(anyPrivate ? ['private'] : [])],
        summary:
          'The whole v1 positioning playbook, kept so the articles split from it have a real source.'
      },
      cleanV1(pd.body)
    )
    note(
      latest,
      [legacyRel],
      currentPlaybook ? 'The current playbook; its versions are in output/.' : undefined
    )
    const known = [legacyRel, ...[...v1Inputs.values()]]
    const sectionFile = async (n: string, name: string): Promise<string> => {
      const rel = `memory/positioning-playbook/sections/${n}-${name}.md`
      const d = docs.get(rel)
      if (d) {
        done.add(rel)
        return d.body
      }
      // No section files (an old vault): cut the section out of the playbook by its H2.
      const m = new RegExp(
        `^##\\s+Section\\s+${Number(n)}:[^\\n]*\\n([\\s\\S]*?)(?=^##\\s+Section\\s+\\d+:|$(?![\\s\\S]))`,
        'm'
      ).exec(pd.body)
      return m ? `## Section ${Number(n)}\n${m[1]}` : ''
    }
    const srcFor = known.filter((k) => raw.has(k))
    const simple: [string, string, string][] = [
      ['01', 'market-overview', 'market-overview'],
      ['02', 'target-customers', 'ideal-customer-profile'],
      ['05', 'positioning-statement', 'positioning-statement'],
      ['06', 'competitive-intelligence', 'competitive-landscape'],
      ['07', 'customer-proof-points', 'proof-points']
    ]
    for (const [n, name, slug] of simple) {
      const md = await sectionFile(n, name)
      if (!md.trim()) continue
      const rel = await writeArticle(slug, null, pd, sectionBody(md), srcFor, {
        compiledFrom: 'mixed',
        forcePrivate: anyPrivate
      })
      playbookArticles.push(rel)
      const v1rel = `memory/positioning-playbook/sections/${n}-${name}.md`
      if (docs.has(v1rel)) note(v1rel, [rel])
    }
    const vdMd = await sectionFile('03', 'value-drivers')
    if (vdMd.trim()) {
      let split = splitValueDrivers(vdMd)
      if (!split.split && o.aiSplit) {
        const parts = await o.aiSplit(sectionBody(vdMd), 'value-drivers')
        if (parts?.length)
          split = {
            main: {
              slug: 'value-drivers',
              title: 'Value Drivers',
              body: parts.map((p) => `- ${p.title}`).join('\n')
            },
            parts,
            split: true
          }
      }
      const written: string[] = []
      if (split.main)
        written.push(
          await writeArticle('value-drivers', null, pd, split.main.body, srcFor, {
            compiledFrom: 'mixed',
            forcePrivate: anyPrivate
          })
        )
      for (const p of split.parts)
        written.push(
          await writeArticle(p.slug, p.title, pd, p.body, srcFor, {
            compiledFrom: 'mixed',
            forcePrivate: anyPrivate
          })
        )
      playbookArticles.push(...written)
      const v1rel = 'memory/positioning-playbook/sections/03-value-drivers.md'
      if (docs.has(v1rel))
        note(
          v1rel,
          written,
          split.split ? undefined : 'Could not be split into drivers; kept as one article.'
        )
    }
    const moatMd = await sectionFile('04', 'distinct-advantages')
    if (moatMd.trim()) {
      let split = splitMoats(moatMd)
      if (!split.split && o.aiSplit) {
        const parts = await o.aiSplit(sectionBody(moatMd), 'moats')
        if (parts?.length) split = { main: null, parts, split: true, rest: '' }
      }
      const written: string[] = []
      for (const p of split.parts)
        written.push(
          await writeArticle(p.slug, p.title, pd, p.body, srcFor, {
            compiledFrom: 'mixed',
            forcePrivate: anyPrivate
          })
        )
      playbookArticles.push(...written)
      const v1rel = 'memory/positioning-playbook/sections/04-distinct-advantages.md'
      if (docs.has(v1rel))
        note(
          v1rel,
          [...written, legacyRel],
          split.split
            ? 'The moat summary stays in the legacy playbook source.'
            : 'Could not be split into moats; kept as one article.'
        )
    }
  }

  // --- Outputs: playbook versions and the messaging analysis ---------------------------------
  step('Copying playbook versions and the messaging analysis')
  for (const f of versions) {
    const d = docs.get(f) ?? (await readV1(root, f))
    if (!d) continue
    const n = Number(/-v(\d+)-/.exec(f)?.[1] ?? d.data.version ?? 1)
    const day = /-(\d{4}-\d{2}-\d{2})\.md$/.exec(f)?.[1] ?? (d.created || date)
    const rel = outputRel(PLAYBOOK_KIND, n, day)
    if (await exists(join(root, rel))) continue
    await writeFile(
      safeJoin(root, rel),
      stringifyDoc(
        'output',
        {
          title: `Positioning Playbook: ${company} (v${n})`,
          type: 'report',
          created: day,
          updated: day,
          summary: 'Seven-section positioning playbook, carried over from PositioningHQ v1.',
          sources: playbookArticles.length
            ? playbookArticles
            : ['wiki/references/company-profile.md']
        },
        d.body.trim()
      )
    )
    note(f, [rel])
  }
  for (const f of await list(root, 'memory/messaging-analysis')) {
    const d = docs.get(f)
    if (!d) continue
    const day = d.created || date
    const rel = outputRel('messaging-analysis', 1, day)
    const cited = [
      'wiki/topics/current-messaging.md',
      'wiki/references/social-taglines.md',
      'wiki/concepts/positioning-statement.md'
    ].filter((p) => articles.includes(p))
    await writeFile(
      safeJoin(root, rel),
      stringifyDoc(
        'output',
        {
          title: `Messaging Analysis: ${company} (v1)`,
          type: 'report',
          created: day,
          updated: day,
          summary: `Messaging analysis of ${company}, carried over from PositioningHQ v1.`,
          sources: cited.length ? cited : ['wiki/references/company-profile.md']
        },
        d.body.trim()
      ),
      { flag: 'wx' }
    )
    note(f, [rel])
  }

  // --- Everything else is accounted for in the report ------------------------------------------
  for (const f of await walk(root, 'memory')) {
    if (done.has(f)) continue
    const why =
      f.startsWith('memory/company-research/') && !f.includes('/steps/')
        ? 'The assembled company research; its steps became articles.'
        : f.endsWith('/index.md')
          ? 'An index the app rebuilt; the new wiki has its own indexes.'
          : 'Not carried over.'
    note(f, [], why)
  }
  for (const f of await walk(root, 'outputs')) note(f, [], 'Empty in v1.')
  if (await exists(join(root, 'vault.config.md')))
    note('vault.config.md', ['config.md'], 'Replaced by config.md.')

  await finish(
    root,
    date,
    `PositioningHQ v1 workspace converted to wiki format 1 (${articles.length} articles)`
  )
  return { report, articles, legacy: await legacyPresent(root) }
}

async function finish(root: string, date: string, text: string): Promise<void> {
  await appendLog(root, 'migrate', text, date)
  await writeIndexes(root)
}

async function legacyPresent(root: string): Promise<string[]> {
  const out: string[] = []
  for (const e of LEGACY_ENTRIES) if (await exists(join(root, e))) out.push(e)
  return out
}

/** After the founder agrees: delete the v1 folders, or move them to inbox/.unknown/v1-legacy/. */
export async function retireLegacy(root: string, how: 'remove' | 'move'): Promise<void> {
  const target = join(root, 'inbox', '.unknown', 'v1-legacy')
  if (how === 'move') await mkdir(target, { recursive: true })
  for (const e of LEGACY_ENTRIES) {
    const p = join(root, e)
    if (!(await exists(p))) continue
    if (how === 'remove') await rm(p, { recursive: true, force: true })
    else await rename(p, join(target, e.replace(/^\./, '')))
  }
  await writeIndexes(root)
}
