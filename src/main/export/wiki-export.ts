import { readdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import JSZip from 'jszip'
import { stringField, stringList, stringifyDoc } from '../wiki/frontmatter'
import { writeIndexes } from '../wiki/index-gen'
import { appendLog } from '../wiki/log'
import { freeRel, isoDay, safeJoin } from '../wiki/paths'
import { scanWiki } from '../wiki/scan'

/**
 * Use your wiki (REQUIREMENTS-v2 4.5): for AI tools that can't read a folder, the wiki as one
 * markdown file, and the whole wiki as a zip. Private articles are left out of the single file
 * unless the person asks for them (7.2).
 */

export interface ExportResult {
  path: string
  articles: number
  /** Private articles left out. */
  excludedPrivate: number
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

const stripFrontMatter = (t: string): string => t.replace(/^---\n[\s\S]*?\n---\n\n?/, '')

export async function exportSingleFile(
  root: string,
  opts: { includePrivate: boolean; date?: string }
): Promise<ExportResult> {
  const date = opts.date ?? isoDay()
  const files = await scanWiki(root)
  const config = files.length ? await readText(join(root, 'config.md')) : ''
  const company = /^title:\s*"?([^"\n]+)"?/m.exec(config)?.[1]?.trim() || 'Company'
  const articles = files
    .filter((f) => f.kind === 'article' && f.dir !== 'wiki/theses' && f.data)
    .sort((a, b) => a.rel.localeCompare(b.rel))
  const isPrivate = (f: (typeof articles)[number]): boolean =>
    stringList(f.data?.tags).includes('private')
  const included = articles.filter((f) => opts.includePrivate || !isPrivate(f))
  const excludedPrivate = articles.length - included.length

  const readme = stripFrontMatter(await readText(join(root, 'README.md'))).trim()
  const index = (await readText(join(root, '_index.md'))).trim()
  const body = [
    `# ${company} positioning wiki (single-file export)`,
    '',
    `Exported on ${date} from a PositioningHQ wiki. Each article below starts with its path in the wiki; cite those paths.${
      excludedPrivate
        ? ` ${excludedPrivate} private article(s) were left out.`
        : opts.includePrivate && articles.some(isPrivate)
          ? ' It includes private articles: do not share it outside the company.'
          : ''
    }`,
    '',
    '## How to read this export',
    '',
    readme.replace(/^#.*\n+/, ''),
    '',
    '## Master index',
    '',
    index.replace(/^#/gm, '##'),
    '',
    ...included.flatMap((f) => [
      '---',
      '',
      `## ${f.rel}`,
      '',
      `Title: ${stringField(f.data?.title)}. Summary: ${stringField(f.data?.summary)}`,
      '',
      f.body
        .trim()
        .replace(/^# .*\n+/, '')
        .replace(/^(#{1,4}) /gm, '#$1 '),
      ''
    ])
  ].join('\n')

  const rel = await freeRel(root, `output/wiki-export-${date}.md`)
  await writeFile(
    safeJoin(root, rel),
    stringifyDoc(
      'output',
      {
        title: `Wiki export: ${company} (${date})`,
        type: 'export',
        created: date,
        updated: date,
        summary: `The whole wiki in one file for AI tools without folder access${excludedPrivate ? ', private articles left out' : ''}.`,
        sources: included.map((f) => f.rel)
      },
      body
    ),
    { flag: 'wx' }
  )
  await appendLog(
    root,
    'output',
    `single-file export (${included.length} articles) -> ${rel}`,
    date
  )
  await writeIndexes(root)
  return { path: rel, articles: included.length, excludedPrivate }
}

/** Every file in the wiki (Obsidian's own settings folder left out), as a zip at `target`. */
export async function exportZip(root: string, target: string): Promise<number> {
  const zip = new JSZip()
  let count = 0
  async function add(rel: string): Promise<void> {
    for (const e of await readdir(join(root, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${e.name}` : e.name
      if (e.name === '.obsidian' || e.name === '.DS_Store' || e.name === '.git') continue
      if (e.isDirectory()) await add(child)
      else if (e.isFile()) {
        zip.file(child, await readFile(join(root, child)))
        count++
      }
    }
  }
  await add('')
  await writeFile(target, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
  return count
}
