import { createHash } from 'crypto'
import { readFile, writeFile } from 'fs/promises'
import { z } from 'zod'
import { CONFIDENCE, type ArticleFrontMatter, type Confidence } from '@shared/wiki-types'
import type { OutputTool } from '../providers/types'
import { renderArticleBody, type SeeAlso, type SourceRef } from '../wiki/article'
import { specFor, type ArticleSpec } from '../wiki/article-map'
import { clampConfidence, type SourceInfo } from '../wiki/confidence'
import {
  parseDoc,
  stringField,
  stringifyDoc,
  stringList,
  type FrontMatter
} from '../wiki/frontmatter'
import { link, parseLinks, rawLink } from '../wiki/links'
import { linkDest, relLink, safeJoin, slugify } from '../wiki/paths'
import { scanWiki } from '../wiki/scan'
import { replaceEmDashes, stripOuterFence } from './postprocess'

/**
 * Structured article output (REQUIREMENTS-v2 3.2). AI tasks return articles through a schema-only
 * tool; this module validates them and renders spec-conformant files. Nothing the model writes
 * reaches disk without passing through here, and paths always come from the slug.
 */

export const ARTICLE_TOOL_NAME = 'write_articles'

const SOURCE = {
  type: 'object',
  properties: {
    ref: {
      type: 'string',
      description:
        'The path attribute of a document you were given, or the URL of a web page you read in this task.'
    },
    quote: { type: 'string', description: 'A short exact quote from it that supports a claim.' }
  },
  required: ['ref']
}

export const ARTICLE_TOOL: OutputTool = {
  name: ARTICLE_TOOL_NAME,
  description:
    'Saves the finished wiki articles. Call it once with every article this task produces. The app checks and writes them.',
  schema: {
    type: 'object',
    properties: {
      articles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            slug: {
              type: 'string',
              description: 'Exactly as listed, or the pattern with <x> filled in.'
            },
            category: { type: 'string', enum: ['concept', 'topic', 'reference'] },
            title: { type: 'string' },
            summary: { type: 'string', description: 'One sentence.' },
            aliases: { type: 'array', items: { type: 'string' } },
            tags: { type: 'array', items: { type: 'string' } },
            confidence: { type: 'string', enum: [...CONFIDENCE] },
            abstract: {
              type: 'string',
              description: 'One paragraph that gives the point on its own.'
            },
            body: {
              type: 'string',
              description:
                'The sections, as markdown with ## headings. No title, abstract, See Also or Sources.'
            },
            category_term: {
              type: 'string',
              description:
                'Competitor articles only: the generic term for them, e.g. "legacy forecasting suites".'
            },
            sources: { type: 'array', items: SOURCE, minItems: 1 },
            see_also: {
              type: 'array',
              items: {
                type: 'object',
                properties: { slug: { type: 'string' }, note: { type: 'string' } },
                required: ['slug']
              }
            }
          },
          required: [
            'slug',
            'category',
            'title',
            'summary',
            'tags',
            'confidence',
            'abstract',
            'body',
            'sources'
          ]
        }
      },
      patches: {
        type: 'array',
        description: 'Sections to add to existing articles, when the task says to.',
        items: {
          type: 'object',
          properties: {
            slug: { type: 'string' },
            sections: {
              type: 'string',
              description: 'Markdown with ## headings. Replaces sections with the same heading.'
            },
            sources: { type: 'array', items: SOURCE }
          },
          required: ['slug', 'sections', 'sources']
        }
      }
    },
    required: ['articles']
  }
}

const str = z.string()
const SourceSchema = z.object({ ref: str, quote: str.optional() })
const ArticleOutSchema = z.object({
  slug: str,
  category: str,
  title: str,
  summary: str,
  aliases: z.array(str).optional().default([]),
  tags: z.array(str).optional().default([]),
  confidence: z.enum(CONFIDENCE).catch('low'),
  abstract: str,
  body: str,
  category_term: str.optional(),
  sources: z.array(SourceSchema).optional().default([]),
  see_also: z
    .array(z.object({ slug: str, note: str.optional() }))
    .optional()
    .default([])
})
const PatchOutSchema = z.object({
  slug: str,
  sections: str,
  sources: z.array(SourceSchema).optional().default([])
})
export const ToolOutputSchema = z.object({
  articles: z.array(ArticleOutSchema).optional().default([]),
  patches: z.array(PatchOutSchema).optional().default([])
})
export type ToolOutput = z.infer<typeof ToolOutputSchema>
export type ArticleOut = z.infer<typeof ArticleOutSchema>

/** What a task may write. Fixed slugs, or patterns written as "value-driver-*". */
export interface ArticleTargets {
  allowed: string[]
  /** Must be present: a fixed slug, or "prefix*" for at least one of a pattern. */
  required: string[]
  /** Existing articles this task may add sections to ("competitor-*"). */
  patches?: string[]
  /** Most articles one call may write (guards against runaway output). */
  max?: number
}

/** A raw file the task may cite, as the confidence rule sees it. */
export interface RawInfo extends SourceInfo {
  title: string
}

export interface ExistingArticle {
  slug: string
  path: string
  title: string
  data: FrontMatter
  body: string
}

export interface ValidationContext {
  targets: ArticleTargets
  /** Reference (document path, or normalised URL) -> raw files it stands for. */
  refs: Map<string, string[]>
  raw: Map<string, RawInfo>
  existing: Map<string, ExistingArticle>
  today: string
  normalizeUrl: (url: string) => string
  /**
   * The task was shown private material: everything it writes is tagged private, cited or not
   * (spec section 8, acceptance 4). The model's citations don't decide the isolation boundary.
   */
  forcePrivate?: boolean
}

export interface PreparedFile {
  slug: string
  path: string
  text: string
  sources: string[]
}

export interface ValidationResult {
  files: PreparedFile[]
  /** Problems worth a retry: unknown slugs, wrong categories, missing required articles. */
  errors: string[]
  /** Problems fixed or tolerated: dropped sources, links kept as text. */
  warnings: string[]
}

const matchesTarget = (slug: string, target: string): boolean =>
  target.endsWith('*')
    ? slug.startsWith(target.slice(0, -1)) && slug.length > target.length - 1
    : slug === target

const oneLine = (s: string): string => replaceEmDashes(s.replace(/\s+/g, ' ').trim())

/** Drops a leading title, and any Sources or See Also section the model wrote: the app writes those. */
export function cleanBody(body: string): string {
  let text = replaceEmDashes(stripOuterFence(body)).replace(/\r\n/g, '\n').trim()
  text = text.replace(/^#\s+.*\n+/, '')
  const parts = text.split(/^(?=## )/m)
  return parts
    .filter((p) => !/^## (Sources|See Also|References)\s*$/im.test(p.split('\n')[0]))
    .join('')
    .trim()
}

/**
 * Rewrites every cross-reference in a body as a two-form link when the target article exists,
 * and as plain text when it does not (reported for the lint view). External links are kept.
 */
export function normalizeLinks(
  fromPath: string,
  body: string,
  articles: Map<string, { path: string; title: string }>,
  missing: Set<string>
): string {
  const resolveSlug = (slug: string): { slug: string; path: string; title: string } | null => {
    const a = articles.get(slug.trim())
    return a ? { slug: slug.trim(), ...a } : null
  }
  const plain = (slug: string, title?: string): string => {
    missing.add(slug.trim())
    return title?.trim() || slug.trim()
  }
  // Finished links are parked as placeholders so a later pass can't rewrite part of them.
  const done: string[] = []
  const park = (text: string): string => `\uE000${done.push(text) - 1}\uE000`
  const make = (slug: string, title?: string): string => {
    const t = resolveSlug(slug)
    return t ? park(link(fromPath, { ...t, title: title?.trim() || t.title })) : plain(slug, title)
  }
  // Two-form, then markdown links to .md files, then plain wikilinks.
  let out = body.replace(
    /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]\s*\(\[[^\]]*\]\((?:<[^>\n]+>|[^)\n]+)\)\)/g,
    (_m, slug: string, title?: string) => make(slug, title)
  )
  out = out.replace(
    /(?<![!\]])\[([^\]\n]+)\]\((<[^>\n]+>|[^)\s]+)\)/g,
    (m, text: string, dest: string) => {
      const d = dest.replace(/^<|>$/g, '')
      if (/^[a-z][a-z0-9+.-]*:/i.test(d) || d.startsWith('#') || !d.endsWith('.md')) return m
      return make(d.split('/').pop()!.replace(/\.md$/, ''), text)
    }
  )
  out = out.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_m, slug: string, title?: string) =>
    make(slug, title)
  )
  out = out.replace(/\uE000(\d+)\uE000/g, (_m, i: string) => done[Number(i)])
  return out
}

/** Raw paths behind a list of references; unknown references are dropped and reported. */
function resolveSources(
  refs: { ref: string; quote?: string }[],
  ctx: ValidationContext,
  warnings: string[],
  where: string
): string[] {
  const out = new Set<string>()
  for (const r of refs) {
    const key = /^https?:\/\//i.test(r.ref.trim()) ? ctx.normalizeUrl(r.ref.trim()) : r.ref.trim()
    const paths = ctx.refs.get(key)
    if (!paths?.length) {
      warnings.push(
        `${where}: dropped a source that was not among the task's inputs (${r.ref.slice(0, 120)}).`
      )
      continue
    }
    for (const p of paths) if (ctx.raw.has(p)) out.add(p)
  }
  return [...out].sort()
}

function tagsOf(model: string[], extra: string[]): string[] {
  const tags = [...model.map((t) => slugify(t, '')), ...extra].filter(Boolean)
  return [...new Set(tags)].slice(0, 12)
}

const sourceRefs = (paths: string[], raw: Map<string, RawInfo>): SourceRef[] =>
  paths.map((p) => ({ path: p, title: raw.get(p)?.title ?? p }))

function frontMatterFor(
  a: { title: string; summary: string; aliases: string[]; tags: string[]; confidence: Confidence },
  spec: ArticleSpec,
  sources: string[],
  ctx: ValidationContext,
  created: string
): ArticleFrontMatter {
  const infos = sources.map((p) => ctx.raw.get(p)!).filter(Boolean)
  const isPrivate = !!ctx.forcePrivate || infos.some((s) => s.tags.includes('private'))
  return {
    title: oneLine(a.title),
    category: spec.category,
    ...(sources.length ? { sources } : {}),
    created,
    updated: ctx.today,
    tags: tagsOf(a.tags, isPrivate ? ['private'] : []).length
      ? tagsOf(a.tags, isPrivate ? ['private'] : [])
      : ['positioning'],
    aliases: [...new Set([...spec.aliases, ...a.aliases.map(oneLine)].filter(Boolean))].slice(0, 8),
    confidence: sources.length ? clampConfidence(a.confidence, infos) : 'low',
    volatility: spec.volatility,
    verified: ctx.today,
    'compiled-from': sources.length ? 'sources' : 'mixed',
    summary: oneLine(a.summary)
  }
}

/** Splits a body into what comes before the first ## heading, and its ## sections. */
export function splitSections(body: string): {
  head: string
  sections: { heading: string; text: string }[]
} {
  const parts = body.split(/^(?=## )/m)
  const head = /^## /.test(parts[0] ?? '') ? '' : (parts.shift() ?? '')
  return {
    head,
    sections: parts.map((p) => ({
      heading: p
        .split('\n')[0]
        .replace(/^##\s+/, '')
        .trim(),
      text: p.trimEnd()
    }))
  }
}

/**
 * Validates a task's tool output and renders the files to write (REQUIREMENTS-v2 3.2 steps 1 to 7).
 * Never throws for bad model output: problems come back as errors (retry) or warnings.
 */
export function validateOutput(raw: unknown, ctx: ValidationContext): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const parsed = ToolOutputSchema.safeParse(raw ?? {})
  if (!parsed.success) {
    return {
      files: [],
      errors: [
        `The ${ARTICLE_TOOL_NAME} arguments did not match the schema: ${parsed.error.issues[0]?.message ?? 'invalid'}.`
      ],
      warnings
    }
  }
  const { targets } = ctx
  const out = parsed.data
  const accepted: { a: ArticleOut; spec: ArticleSpec }[] = []
  const seen = new Set<string>()

  // 1. Slugs and categories.
  for (const a of out.articles.slice(0, targets.max ?? 12)) {
    const slug = a.slug.trim()
    const spec = specFor(slug)
    if (!spec || !targets.allowed.some((t) => matchesTarget(slug, t))) {
      errors.push(
        `"${slug}" is not a slug this task may write. Allowed: ${targets.allowed.join(', ')}.`
      )
      continue
    }
    if (a.category !== spec.category) {
      errors.push(`"${slug}" must have category "${spec.category}", not "${a.category}".`)
      continue
    }
    if (seen.has(slug)) {
      errors.push(`"${slug}" was written twice.`)
      continue
    }
    if (slug.startsWith('competitor-') && !a.category_term?.trim())
      errors.push(`"${slug}" needs a category_term.`)
    seen.add(slug)
    accepted.push({ a: { ...a, slug }, spec })
  }
  for (const r of targets.required) {
    if (![...seen].some((s) => matchesTarget(s, r))) errors.push(`The task must write "${r}".`)
  }

  // Articles this batch can link to: what exists plus what is being written.
  const linkable = new Map<string, { path: string; title: string }>()
  for (const e of ctx.existing.values()) linkable.set(e.slug, { path: e.path, title: e.title })
  for (const { a, spec } of accepted) {
    linkable.set(a.slug, {
      path: `wiki/${{ concept: 'concepts', topic: 'topics', reference: 'references' }[spec.category]}/${a.slug}.md`,
      title: spec.pattern ? oneLine(a.title) : spec.title
    })
  }

  const files: PreparedFile[] = []
  const missing = new Set<string>()
  for (const { a, spec } of accepted) {
    const path = linkable.get(a.slug)!.path
    // 2 to 4. Sources resolved against the inputs; confidence clamped; private propagated.
    const sources = resolveSources(a.sources, ctx, warnings, a.slug)
    if (!sources.length) warnings.push(`${a.slug}: no usable sources, so confidence is low.`)
    const title = spec.pattern ? oneLine(a.title) : spec.title
    const fm = frontMatterFor(
      { ...a, title },
      spec,
      sources,
      ctx,
      stringField(ctx.existing.get(a.slug)?.data.created) || ctx.today
    )
    // 5 and 6. Body shape, links, See Also and Sources written by the app.
    let sections = normalizeLinks(path, cleanBody(a.body), linkable, missing)
    if (a.category_term?.trim())
      sections = `**Category term:** ${oneLine(a.category_term)}\n\n${sections}`
    const seeAlso: SeeAlso[] = []
    for (const s of a.see_also) {
      const t = linkable.get(s.slug.trim())
      if (!t || s.slug.trim() === a.slug) {
        if (s.slug.trim() !== a.slug) missing.add(s.slug.trim())
        continue
      }
      if (seeAlso.some((x) => x.target.slug === s.slug.trim())) continue
      seeAlso.push({ target: { slug: s.slug.trim(), ...t }, note: oneLine(s.note ?? '') })
    }
    // 7. Em dashes replaced throughout; front matter limited to spec keys by the writer.
    const text = stringifyDoc(
      'article',
      fm,
      renderArticleBody({
        path,
        frontMatter: fm,
        abstract: oneLine(a.abstract),
        sections,
        seeAlso,
        sources: sourceRefs(sources, ctx.raw)
      })
    )
    files.push({ slug: a.slug, path, text, sources })
  }

  // Patches: sections merged into existing articles.
  for (const p of out.patches) {
    const slug = p.slug.trim()
    const existing = ctx.existing.get(slug)
    if (!existing || !(targets.patches ?? []).some((t) => matchesTarget(slug, t))) {
      errors.push(`"${slug}" is not an existing article this task may add to.`)
      continue
    }
    const added = resolveSources(p.sources, ctx, warnings, slug)
    files.push(
      patchArticle(
        existing,
        normalizeLinks(existing.path, cleanBody(p.sections), linkable, missing),
        added,
        ctx
      )
    )
  }

  if (missing.size)
    warnings.push(
      `Links to articles that don't exist yet were kept as text: ${[...missing].sort().join(', ')}.`
    )
  return { files, errors, warnings }
}

/** Merges new sections into an existing article, replacing sections with the same heading. */
export function patchArticle(
  e: ExistingArticle,
  sectionsMd: string,
  addedSources: string[],
  ctx: ValidationContext
): PreparedFile {
  const current = splitSections(e.body)
  const incoming = splitSections(sectionsMd).sections
  const tail = new Set(['See Also', 'Sources'])
  const body = current.sections.filter((s) => !tail.has(s.heading))
  for (const s of incoming) {
    if (tail.has(s.heading)) continue
    const i = body.findIndex((b) => b.heading.toLowerCase() === s.heading.toLowerCase())
    if (i >= 0) body[i] = s
    else body.push(s)
  }
  const seeAlso = current.sections.find((s) => s.heading === 'See Also')
  const sources = [...new Set([...stringList(e.data.sources), ...addedSources])]
    .filter((p) => ctx.raw.has(p))
    .sort()
  const infos = sources.map((p) => ctx.raw.get(p)!)
  const tags = stringList(e.data.tags)
  const priv = ctx.forcePrivate || infos.some((s) => s.tags.includes('private'))
  if (priv && !tags.includes('private')) tags.push('private')
  const proposed = (CONFIDENCE as readonly string[]).includes(stringField(e.data.confidence))
    ? (stringField(e.data.confidence) as Confidence)
    : 'medium'
  const data: FrontMatter = {
    ...e.data,
    ...(sources.length ? { sources } : {}),
    updated: ctx.today,
    verified: ctx.today,
    tags,
    confidence: sources.length ? clampConfidence(proposed, infos) : 'low',
    'compiled-from': sources.length ? 'sources' : 'mixed'
  }
  const srcSection = sources.length
    ? [
        '## Sources',
        '',
        ...sources.map((p) => `- ${rawLink(e.path, p, ctx.raw.get(p)?.title ?? p)}`)
      ].join('\n')
    : ''
  const text = [current.head.trimEnd(), ...body.map((s) => s.text), seeAlso?.text ?? '', srcSection]
    .filter((x) => x.trim())
    .join('\n\n')
  return { slug: e.slug, path: e.path, text: stringifyDoc('article', data, text), sources }
}

/** Every article in the wiki, by slug. */
export async function loadArticles(wikiRoot: string): Promise<Map<string, ExistingArticle>> {
  const out = new Map<string, ExistingArticle>()
  for (const f of await scanWiki(wikiRoot)) {
    if (f.kind !== 'article' || !f.data || f.dir === 'wiki/theses') continue
    out.set(f.name, {
      slug: f.name,
      path: f.rel,
      title: stringField(f.data.title) || f.name,
      data: f.data,
      body: f.body
    })
  }
  return out
}

/** Every raw file in the wiki, for source resolution and the confidence rule. */
export async function loadRaw(wikiRoot: string): Promise<Map<string, RawInfo>> {
  const out = new Map<string, RawInfo>()
  for (const f of await scanWiki(wikiRoot)) {
    if (f.kind !== 'raw' || !f.data) continue
    out.set(f.rel, {
      path: f.rel,
      source: stringField(f.data.source),
      tags: stringList(f.data.tags),
      title: stringField(f.data.title) || f.name
    })
  }
  return out
}

export const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

/** Writes the prepared files. Returns their paths. */
export async function writePrepared(wikiRoot: string, files: PreparedFile[]): Promise<string[]> {
  for (const f of files) await writeFile(safeJoin(wikiRoot, f.path), f.text)
  return files.map((f) => f.path)
}

/**
 * Makes See Also reciprocal (llm-wiki C4): every article a changed article lists gets a link
 * back. Only the target's See Also section changes. Returns the paths edited.
 */
async function addBacklinksNow(wikiRoot: string, changed: string[]): Promise<string[]> {
  const articles = await loadArticles(wikiRoot)
  const bySlug = new Map([...articles.values()].map((a) => [a.slug, a]))
  const edited = new Set<string>()
  for (const path of changed) {
    const slug = path.split('/').pop()!.replace(/\.md$/, '')
    const a = bySlug.get(slug)
    if (!a) continue
    const see = splitSections(a.body).sections.find((s) => s.heading === 'See Also')
    if (!see) continue
    for (const l of parseLinks(a.path, see.text)) {
      const b = l.slug ? bySlug.get(l.slug) : undefined
      if (!b || b.slug === slug) continue
      const parts = splitSections(b.body)
      const bSee = parts.sections.find((s) => s.heading === 'See Also')
      if (bSee && parseLinks(b.path, bSee.text).some((x) => x.slug === slug)) continue
      const line = `- ${link(b.path, { slug, title: a.title, path: a.path })}`
      let body: string
      if (bSee) body = b.body.replace(bSee.text, `${bSee.text.trimEnd()}\n${line}`)
      else {
        const src = parts.sections.find((s) => s.heading === 'Sources')
        const block = `## See Also\n\n${line}\n\n`
        body = src
          ? b.body.replace(src.text, `${block}${src.text}`)
          : `${b.body.trimEnd()}\n\n## See Also\n\n${line}\n`
      }
      const text = await readFile(safeJoin(wikiRoot, b.path), 'utf8')
      const doc = parseDoc(text)
      if (!doc) continue
      await writeFile(
        safeJoin(wikiRoot, b.path),
        text.slice(0, text.length - doc.body.length) + body
      )
      b.body = body
      edited.add(b.path)
    }
  }
  return [...edited]
}

/** One back-link pass at a time per wiki: parallel tasks edit the same See Also sections. */
const backlinkQueues = new Map<string, Promise<unknown>>()

export function addBacklinks(wikiRoot: string, changed: string[]): Promise<string[]> {
  const prev = backlinkQueues.get(wikiRoot) ?? Promise.resolve()
  const next = prev.then(() => addBacklinksNow(wikiRoot, changed))
  backlinkQueues.set(
    wikiRoot,
    next.catch(() => undefined)
  )
  return next
}

/** A full pass: every See Also in the wiki made reciprocal. */
export async function reciprocateSeeAlso(wikiRoot: string): Promise<string[]> {
  const all = [...(await loadArticles(wikiRoot)).values()].map((a) => a.path)
  return addBacklinks(wikiRoot, all)
}

/** Relative markdown link from one wiki path to another (outputs link to articles this way). */
export const mdLink = (from: string, to: string, title: string): string =>
  `[${title.replace(/[[\]]/g, '')}](${linkDest(relLink(from, to))})`
