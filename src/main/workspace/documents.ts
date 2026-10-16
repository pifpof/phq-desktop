import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import matter from 'gray-matter'
import type { Doc, DocMeta } from '@shared/workspace'
import { resolveInside, toPosix } from './paths'

/** YAML dates become Date objects; make everything JSON-safe for IPC. */
const plain = (v: Record<string, unknown>): Record<string, unknown> => JSON.parse(JSON.stringify(v))

function titleOf(frontMatter: Record<string, unknown>, body: string, path: string): string {
  if (typeof frontMatter.title === 'string' && frontMatter.title) return frontMatter.title
  const h1 = /^#\s+(.+)$/m.exec(body)
  if (h1?.[1]) return h1[1].trim()
  return path.split('/').pop()!.replace(/\.md$/i, '')
}

export async function readDoc(root: string, rel: string): Promise<Doc | null> {
  const full = resolveInside(root, rel)
  if (!full || !rel.toLowerCase().endsWith('.md')) return null
  try {
    const [raw, info] = await Promise.all([readFile(full, 'utf8'), stat(full)])
    const parsed = matter(raw)
    const frontMatter = plain(parsed.data)
    return {
      path: toPosix(rel),
      title: titleOf(frontMatter, parsed.content, rel),
      frontMatter,
      body: parsed.content,
      mtime: info.mtimeMs
    }
  } catch {
    // missing or unreadable: the file was moved or deleted outside the app
    return null
  }
}

async function walk(root: string, dir: string, out: string[]): Promise<void> {
  let entries
  try {
    entries = await readdir(join(root, dir), { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const rel = dir ? `${dir}/${e.name}` : e.name
    if (e.isDirectory()) await walk(root, rel, out)
    else if (e.name.toLowerCase().endsWith('.md')) out.push(rel)
  }
}

/** Markdown documents under `dir` (default: memory), sorted by path. Skips unreadable files. */
export async function listDocs(root: string, dir = 'memory'): Promise<DocMeta[]> {
  if (!resolveInside(root, dir)) return []
  const paths: string[] = []
  await walk(root, dir, paths)
  const docs = await Promise.all(paths.map((p) => readDoc(root, p)))
  return docs
    .filter((d): d is Doc => d !== null)
    .map(({ body: _body, ...meta }) => {
      void _body
      return meta
    })
    .sort((a, b) => a.path.localeCompare(b.path))
}
