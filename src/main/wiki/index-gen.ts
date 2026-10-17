import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { RAW_TYPES } from '@shared/wiki-types'
import { START_HERE } from './article-map'
import { parseDoc, stringField, stringList } from './frontmatter'
import { lastLogDate } from './log'
import { linkDest } from './paths'
import { RAW_DIRS, scanWiki, THESES_DIR, WIKI_DIRS, type WikiFile } from './scan'

/**
 * `_index.md` files (spec section 5). Derived from front matter only, never from a model, and
 * deterministic: the same files always give the same text, so git diffs stay small.
 */

const DIR_TEXT: Record<string, [string, string]> = {
  'raw/articles': [
    'Articles',
    'Web pages: your website, competitor pages and web citation records.'
  ],
  'raw/papers': ['Papers', 'Your documents: decks, case studies, strategy docs.'],
  'raw/notes': ['Notes', 'Social profiles, interview notes and pasted text.'],
  'raw/data': ['Data', 'Your spreadsheets and CSV exports.'],
  'raw/repos': ['Repos', 'Code repositories. Not used by PositioningHQ.'],
  'wiki/concepts': ['Concepts', 'Positioning statement, value drivers and moats.'],
  'wiki/topics': ['Topics', 'Company, product, market, customers and current messaging.'],
  'wiki/references': ['References', 'Company profile, competitors, proof, taglines and decisions.'],
  'wiki/theses': ['Theses', 'Not used by PositioningHQ.']
}

export const cell = (v: string): string => v.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()

const fileDate = (f: WikiFile): string =>
  stringField(f.data?.updated) || stringField(f.data?.ingested) || stringField(f.data?.created)

const titleOf = (f: WikiFile): string => stringField(f.data?.title) || f.name

const maxDate = (dates: string[], fallback: string): string =>
  dates
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
    .at(-1) ?? fallback

/** Index for a folder of files: contents table and recent changes. */
export function renderLeafIndex(dir: string, files: WikiFile[], fallbackDate: string): string {
  const [title, description] = DIR_TEXT[dir] ?? [dir, '']
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name))
  const rows = sorted.map(
    (f) =>
      `| [${cell(titleOf(f))}](${linkDest(`${f.name}.md`)}) | ${cell(stringField(f.data?.summary))} | ${cell(stringList(f.data?.tags).join(', '))} | ${fileDate(f)} |`
  )
  const recent = [...files]
    .sort((a, b) => fileDate(b).localeCompare(fileDate(a)) || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map((f) => `- ${fileDate(f)}: [${cell(titleOf(f))}](${linkDest(`${f.name}.md`)})`)
  return [
    `# ${title}`,
    '',
    `> ${description}`,
    '',
    `Last updated: ${maxDate(files.map(fileDate), fallbackDate)}`,
    '',
    '## Contents',
    '',
    '| File | Summary | Tags | Updated |',
    '|------|---------|------|---------|',
    ...rows,
    '',
    '## Recent Changes',
    '',
    ...(recent.length ? recent : ['- None yet.']),
    ''
  ].join('\n')
}

export function renderRawRoot(files: WikiFile[], fallbackDate: string): string {
  const raw = files.filter((f) => f.kind === 'raw')
  return [
    '# Raw Sources Index',
    '',
    '> Sources, never edited after ingest.',
    '',
    `Last updated: ${maxDate(raw.map(fileDate), fallbackDate)}`,
    '',
    ...RAW_TYPES.flatMap((t) => [
      `## ${t[0].toUpperCase()}${t.slice(1)}`,
      `See [${t}/_index.md](${t}/_index.md)`,
      ''
    ]),
    '## Stats',
    `- Total sources: ${raw.length}`,
    `- Last updated: ${maxDate(raw.map(fileDate), fallbackDate)}`,
    ''
  ].join('\n')
}

export function renderWikiRoot(files: WikiFile[], fallbackDate: string): string {
  const articles = files.filter((f) => f.kind === 'article')
  return [
    '# Wiki Articles',
    '',
    '> Compiled knowledge. Every article cites its sources in raw/.',
    '',
    `Last updated: ${maxDate(articles.map(fileDate), fallbackDate)}`,
    '',
    ...[...WIKI_DIRS, THESES_DIR].flatMap((d) => {
      const name = d.split('/')[1]
      return [
        `## ${name[0].toUpperCase()}${name.slice(1)}`,
        `See [${name}/_index.md](${name}/_index.md)`,
        ''
      ]
    }),
    '## Stats',
    `- Total articles: ${articles.length}`,
    ''
  ].join('\n')
}

export function renderOutputIndex(files: WikiFile[], fallbackDate: string): string {
  const outputs = files
    .filter((f) => f.kind === 'output')
    .sort((a, b) => a.name.localeCompare(b.name))
  return [
    '# Output Artifacts',
    '',
    '> Deliverables assembled from the wiki. The wiki articles are the source of truth.',
    '',
    `Last updated: ${maxDate(outputs.map(fileDate), fallbackDate)}`,
    '',
    '## Outputs',
    '',
    '| Output | Type | Date |',
    '|--------|------|------|',
    ...outputs.map(
      (f) =>
        `| [${cell(titleOf(f))}](${linkDest(`${f.name}.md`)}) | ${cell(stringField(f.data?.type) || 'report')} | ${fileDate(f)} |`
    ),
    ''
  ].join('\n')
}

export interface MasterInput {
  title: string
  description: string
  files: WikiFile[]
  fallbackDate: string
  lastCompiled: string | null
  lastLint: string | null
}

export function renderMasterIndex(m: MasterInput): string {
  const articles = m.files.filter((f) => f.kind === 'article')
  const bySlug = new Map(articles.map((f) => [f.name, f]))
  const start = START_HERE.map((s) => bySlug.get(s)).filter((f): f is WikiFile => !!f)
  return [
    `# ${m.title}`,
    '',
    `> ${m.description}. Read README.md for how to use this wiki.`,
    '',
    `Last updated: ${maxDate(m.files.map(fileDate), m.fallbackDate)}`,
    '',
    '## Statistics',
    '',
    `- Sources: ${m.files.filter((f) => f.kind === 'raw').length}`,
    `- Articles: ${articles.length}`,
    `- Outputs: ${m.files.filter((f) => f.kind === 'output').length}`,
    `- Last compiled: ${m.lastCompiled ?? 'not yet'}`,
    `- Last lint: ${m.lastLint ?? 'not yet'}`,
    '',
    '## Start here',
    '',
    ...(start.length
      ? start.map(
          (f, i) =>
            `${i + 1}. [${cell(titleOf(f))}](${linkDest(f.rel)}): ${cell(stringField(f.data?.summary))}`
        )
      : ['Nothing yet. Run the research to fill the wiki.']),
    '',
    '## Quick Navigation',
    '',
    '- [All Sources](raw/_index.md)',
    '- [Wiki Articles](wiki/_index.md)',
    '- [Concepts](wiki/concepts/_index.md)',
    '- [Topics](wiki/topics/_index.md)',
    '- [References](wiki/references/_index.md)',
    '- [Outputs](output/_index.md)',
    ''
  ].join('\n')
}

/** All index paths and their text for a wiki, from its files. */
export function renderAllIndexes(m: MasterInput): Map<string, string> {
  const out = new Map<string, string>()
  for (const dir of [...RAW_DIRS, ...WIKI_DIRS, THESES_DIR]) {
    out.set(
      `${dir}/_index.md`,
      renderLeafIndex(
        dir,
        m.files.filter((f) => f.dir === dir),
        m.fallbackDate
      )
    )
  }
  out.set('raw/_index.md', renderRawRoot(m.files, m.fallbackDate))
  out.set('wiki/_index.md', renderWikiRoot(m.files, m.fallbackDate))
  out.set('output/_index.md', renderOutputIndex(m.files, m.fallbackDate))
  out.set('_index.md', renderMasterIndex(m))
  return out
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

/** Regenerates every index in the wiki. Writes only files whose text changed; returns them. */
export async function writeIndexes(root: string): Promise<string[]> {
  const files = await scanWiki(root)
  const config = parseDoc((await readText(join(root, 'config.md'))) ?? '')?.data ?? {}
  const log = (await readText(join(root, 'log.md'))) ?? ''
  const created = stringField(config.created)
  const title = stringField(config.title) || 'PositioningHQ wiki'
  const rendered = renderAllIndexes({
    title,
    description: stringField(config.description) || `PositioningHQ positioning wiki for ${title}`,
    files,
    fallbackDate: /^\d{4}-\d{2}-\d{2}$/.test(created)
      ? created
      : maxDate(files.map(fileDate), '1970-01-01'),
    lastCompiled: lastLogDate(log, 'compile'),
    lastLint: lastLogDate(log, 'lint')
  })
  const written: string[] = []
  for (const [rel, text] of rendered) {
    const full = join(root, rel)
    if ((await readText(full)) === text) continue
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, text)
    written.push(rel)
  }
  return written
}
