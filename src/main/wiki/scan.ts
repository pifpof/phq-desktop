import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { CATEGORY_DIR, RAW_TYPES } from '@shared/wiki-types'
import { parseDoc, type FrontMatter } from './frontmatter'

/** Reads every raw source, article and loose output in a wiki. Tolerates missing folders. */

export type WikiFileKind = 'raw' | 'article' | 'output'

export interface WikiFile {
  /** Wiki-relative path, forward slashes. */
  rel: string
  kind: WikiFileKind
  /** Folder the file sits in, e.g. raw/articles or wiki/topics. */
  dir: string
  /** File name without .md. For articles this is the slug. */
  name: string
  /** Null when the file has no readable front matter. */
  data: FrontMatter | null
  body: string
}

async function mdFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== '_index.md')
      .map((e) => e.name)
      .sort()
  } catch {
    return []
  }
}

async function readDir(root: string, dir: string, kind: WikiFileKind): Promise<WikiFile[]> {
  const out: WikiFile[] = []
  for (const name of await mdFiles(join(root, dir))) {
    const rel = `${dir}/${name}`
    let text: string
    try {
      text = await readFile(join(root, rel), 'utf8')
    } catch {
      continue
    }
    const doc = parseDoc(text)
    out.push({
      rel,
      kind,
      dir,
      name: name.slice(0, -3),
      data: doc?.data ?? null,
      body: doc?.body ?? text
    })
  }
  return out
}

export const RAW_DIRS = RAW_TYPES.map((t) => `raw/${t}`)
export const WIKI_DIRS = Object.values(CATEGORY_DIR).map((d) => `wiki/${d}`)
/** Required by llm-wiki lint; PositioningHQ never writes articles here. */
export const THESES_DIR = 'wiki/theses'

export async function scanWiki(root: string): Promise<WikiFile[]> {
  const parts = await Promise.all([
    ...RAW_DIRS.map((d) => readDir(root, d, 'raw')),
    ...[...WIKI_DIRS, THESES_DIR].map((d) => readDir(root, d, 'article')),
    readDir(root, 'output', 'output')
  ])
  return parts.flat()
}
