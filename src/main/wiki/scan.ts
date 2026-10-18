import { readdir, readFile, stat } from 'fs/promises'
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
  /** File modification time, ms since the epoch. */
  mtimeMs: number
}

/** Files already read, keyed by path; reused while their time and size are unchanged. */
export type ScanCache = Map<string, { mtimeMs: number; size: number; file: WikiFile }>

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

async function readOne(
  root: string,
  dir: string,
  name: string,
  kind: WikiFileKind,
  cache?: ScanCache
): Promise<WikiFile | null> {
  const rel = `${dir}/${name}`
  const abs = join(root, rel)
  try {
    const st = await stat(abs)
    const hit = cache?.get(rel)
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.file
    const text = await readFile(abs, 'utf8')
    const doc = parseDoc(text)
    const file: WikiFile = {
      rel,
      kind,
      dir,
      name: name.slice(0, -3),
      data: doc?.data ?? null,
      body: doc?.body ?? text,
      mtimeMs: st.mtimeMs
    }
    cache?.set(rel, { mtimeMs: st.mtimeMs, size: st.size, file })
    return file
  } catch {
    return null
  }
}

async function readDir(
  root: string,
  dir: string,
  kind: WikiFileKind,
  cache?: ScanCache
): Promise<WikiFile[]> {
  const names = await mdFiles(join(root, dir))
  const files = await Promise.all(names.map((n) => readOne(root, dir, n, kind, cache)))
  return files.filter((f): f is WikiFile => f !== null)
}

export const RAW_DIRS = RAW_TYPES.map((t) => `raw/${t}`)
export const WIKI_DIRS = Object.values(CATEGORY_DIR).map((d) => `wiki/${d}`)
/** Required by llm-wiki lint; PositioningHQ never writes articles here. */
export const THESES_DIR = 'wiki/theses'

/** With a cache, only files whose time or size changed are read again. */
export async function scanWiki(root: string, cache?: ScanCache): Promise<WikiFile[]> {
  const parts = await Promise.all([
    ...RAW_DIRS.map((d) => readDir(root, d, 'raw', cache)),
    ...[...WIKI_DIRS, THESES_DIR].map((d) => readDir(root, d, 'article', cache)),
    readDir(root, 'output', 'output', cache)
  ])
  const files = parts.flat()
  if (cache) {
    const present = new Set(files.map((f) => f.rel))
    for (const rel of cache.keys()) if (!present.has(rel)) cache.delete(rel)
  }
  return files
}
