import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname } from 'path'
import type { WebSource } from '../providers/types'
import { replaceEmDashes } from '../research/postprocess'
import { stringifyDoc } from '../wiki/frontmatter'
import { freeRel, rawRel, safeJoin } from '../wiki/paths'
import { pageName } from './website-to-raw'

/**
 * Citation ingest (REQUIREMENTS-v2 3.1, spec 4.4). Each URL a web task cited or fetched becomes a
 * raw file in raw/articles/: the full page when it was fetched as text, otherwise a citation
 * record of the excerpts cited. Within one run a URL has one file, which gains excerpts while the
 * run lasts; after the run it is never edited again (a later run writes a new dated file).
 *
 * The URL-to-file map for a run is saved in app state, so a resumed run keeps using the same files.
 */

interface Entry {
  rel: string
  title: string
  /** full: a fetched page or crawled page; record: excerpts only. */
  kind: 'full' | 'record' | 'crawl'
  excerpts: string[]
  tags: string[]
  /** False for a page a search returned that the answer did not cite. */
  cited?: boolean
}

export const normalizeSourceUrl = (url: string): string => {
  try {
    const u = new URL(url)
    u.hash = ''
    for (const k of [...u.searchParams.keys()])
      if (/^utm_|^(gclid|fbclid|mc_cid|mc_eid|ref)$/i.test(k)) u.searchParams.delete(k)
    return u.toString().replace(/\/$/, '')
  } catch {
    return url
  }
}

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim()

export interface IngestReport {
  /** Normalised URL -> wiki path, for every source of this call. */
  paths: Map<string, string>
  /** Raw files created by this call. */
  created: string[]
}

export class RunSources {
  private entries = new Map<string, Entry>()
  private loaded = false

  constructor(
    private readonly wikiRoot: string,
    /** JSON file in app state holding this run's map. */
    private readonly statePath: string,
    private readonly date: string
  ) {}

  private async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    try {
      const data = JSON.parse(await readFile(this.statePath, 'utf8')) as Record<string, Entry>
      for (const [url, e] of Object.entries(data)) this.entries.set(url, e)
    } catch {
      /* new run */
    }
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.statePath), { recursive: true })
    await writeFile(this.statePath, JSON.stringify(Object.fromEntries(this.entries), null, 2))
  }

  /** Pages the run's crawl already stored in full: citations of them reuse those files. */
  async seed(pages: { url: string; rel: string; title?: string }[]): Promise<void> {
    await this.load()
    for (const p of pages) {
      const key = normalizeSourceUrl(p.url)
      if (!this.entries.has(key))
        this.entries.set(key, {
          rel: p.rel,
          title: p.title ?? p.url,
          kind: 'crawl',
          excerpts: [],
          tags: []
        })
    }
    await this.save()
  }

  /** Wiki path for a URL already ingested in this run, or null. */
  async pathFor(url: string): Promise<string | null> {
    await this.load()
    return this.entries.get(normalizeSourceUrl(url))?.rel ?? null
  }

  /** All URL to path pairs of this run. */
  async all(): Promise<Map<string, string>> {
    await this.load()
    return new Map([...this.entries].map(([u, e]) => [u, e.rel]))
  }

  /**
   * Writes or extends the raw file of each source. `tagsFor` gives the tags of a new file
   * (web-citation, own-site, competitor-site...). Returns the path of every source.
   */
  async ingest(sources: WebSource[], tagsFor: (url: string) => string[]): Promise<IngestReport> {
    await this.load()
    const paths = new Map<string, string>()
    const created: string[] = []
    const taken = new Set([...this.entries.values()].map((e) => e.rel))
    for (const s of sources) {
      const key = normalizeSourceUrl(s.url)
      const excerpts = s.excerpts.map((x) => replaceEmDashes(oneLine(x))).filter(Boolean)
      let e = this.entries.get(key)
      if (e?.kind === 'crawl') {
        paths.set(key, e.rel)
        continue
      }
      let changed = false
      if (!e) {
        const rel = await freeRel(
          this.wikiRoot,
          rawRel('articles', this.date, pageName(key)),
          taken
        )
        taken.add(rel)
        e = {
          rel,
          title: replaceEmDashes(oneLine(s.title || key)),
          kind: s.fullText ? 'full' : 'record',
          excerpts: [],
          tags: [...new Set(tagsFor(key))],
          cited: s.cited
        }
        this.entries.set(key, e)
        created.push(rel)
        changed = true
      }
      if (s.cited && e.cited === false) {
        e.cited = true
        changed = true
      }
      if (s.fullText && e.kind === 'record') {
        e.kind = 'full'
        changed = true
      }
      for (const x of excerpts) {
        if (!e.excerpts.includes(x)) {
          e.excerpts.push(x)
          changed = true
        }
      }
      if (changed) await this.write(key, e, s.fullText)
      paths.set(key, e.rel)
    }
    await this.save()
    return { paths, created }
  }

  private async write(url: string, e: Entry, fullText?: string): Promise<void> {
    const full = e.kind === 'full'
    let body: string
    if (full) {
      // Keep the fetched text if this call has none (the page was fetched by an earlier task).
      const text =
        fullText ??
        (await readFile(safeJoin(this.wikiRoot, e.rel), 'utf8')
          .then((t) => t.replace(/^---\n[\s\S]*?\n---\n\n?/, '').replace(/^# .*\n\n?/, ''))
          .catch(() => ''))
      body = [`# ${e.title}`, '', replaceEmDashes(text.trim())].join('\n')
    } else {
      body = [
        `# ${e.title}`,
        '',
        'Citation record. The excerpts below are what the research cited from this page.',
        '',
        ...(e.excerpts.length
          ? e.excerpts.map((x) => `- "${x.replace(/"/g, "'")}" (cited ${this.date})`)
          : [
              e.cited === false
                ? `- Returned by a search on ${this.date}; no excerpt was cited.`
                : `- Cited ${this.date}; no excerpt was returned.`
            ])
      ].join('\n')
    }
    const tags = e.kind === 'full' ? e.tags : [...new Set(['web-citation', ...e.tags])]
    await writeFile(
      safeJoin(this.wikiRoot, e.rel),
      stringifyDoc(
        'raw',
        {
          title: e.title,
          source: url,
          type: 'articles',
          ingested: this.date,
          tags,
          summary: full
            ? `Full text of the page ${e.title}, fetched during research.`
            : 'Citation record: excerpts cited during research. Not a full copy of the page.'
        },
        body
      )
    )
  }
}

/** Tags for a cited URL: own site, a known competitor's site, or another web source. */
export function sourceTagger(opts: {
  ownSite: string
  competitor?: { slug: string; website: string }
}): (url: string) => string[] {
  const host = (u: string): string => {
    try {
      return new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname
        .replace(/^www\./, '')
        .toLowerCase()
    } catch {
      return ''
    }
  }
  const own = host(opts.ownSite)
  const rival = opts.competitor?.website ? host(opts.competitor.website) : ''
  return (url) => {
    const h = host(url)
    const sub = (base: string): boolean => !!base && (h === base || h.endsWith(`.${base}`))
    if (sub(own)) return ['website', 'own-site']
    const comp = opts.competitor ? [`competitor-${opts.competitor.slug}`] : []
    if (sub(rival)) return ['competitor-site', ...comp]
    return ['web-citation', ...comp]
  }
}
