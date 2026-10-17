import { readdir } from 'fs/promises'
import { isAbsolute, join, normalize, relative, sep } from 'path'
import { CATEGORY_DIR, type Category, type RawType } from '@shared/wiki-types'

/** File naming (spec section 3). All wiki-relative paths use forward slashes. */

export const MAX_SLUG = 80

/** Lowercase ASCII kebab-case, at most 80 characters. Accents are folded ("Café" -> "cafe"). */
export function slugify(value: string, fallback = 'untitled'): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/, '')
  return slug || fallback
}

/** YYYY-MM-DD in local time: the date the founder sees on their calendar. */
export function isoDay(d: Date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const toPosix = (p: string): string => p.split(sep).join('/').replace(/\\/g, '/')

/** wiki/<folder>/<slug>.md */
export const articleRel = (category: Category, slug: string): string =>
  `wiki/${CATEGORY_DIR[category]}/${slug}.md`

/** raw/<type>/YYYY-MM-DD-<slug>.md. The slug part leaves room for the date and a clash suffix. */
export function rawRel(type: RawType, date: string, name: string): string {
  return `raw/${type}/${date}-${slugify(name)
    .slice(0, MAX_SLUG - 14)
    .replace(/-+$/, '')}.md`
}

/** <kind>-v<N>-YYYY-MM-DD.md under output/. */
export const outputRel = (kind: string, version: number, date: string): string =>
  `output/${kind}-v${version}-${date}.md`

const OUTPUT_RE = (kind: string): RegExp =>
  new RegExp(`^${kind}-v(\\d+)-\\d{4}-\\d{2}-\\d{2}\\.md$`)

/** Versions of an output kind found in output/, ascending. */
export async function outputVersions(
  root: string,
  kind: string
): Promise<{ version: number; rel: string }[]> {
  let names: string[]
  try {
    names = await readdir(join(root, 'output'))
  } catch {
    return []
  }
  const re = OUTPUT_RE(kind)
  return names
    .map((n) => ({ m: re.exec(n), n }))
    .filter((x): x is { m: RegExpExecArray; n: string } => x.m !== null)
    .map(({ m, n }) => ({ version: Number(m[1]), rel: `output/${n}` }))
    .sort((a, b) => a.version - b.version || a.rel.localeCompare(b.rel))
}

export async function nextOutputVersion(root: string, kind: string): Promise<number> {
  const versions = await outputVersions(root, kind)
  return (versions.at(-1)?.version ?? 0) + 1
}

/** Adds -2, -3 before the extension until the name is not taken. */
export function uniqueRel(rel: string, taken: (rel: string) => boolean): string {
  if (!taken(rel)) return rel
  const dot = rel.lastIndexOf('.')
  const stem = dot > rel.lastIndexOf('/') ? rel.slice(0, dot) : rel
  const ext = dot > rel.lastIndexOf('/') ? rel.slice(dot) : ''
  for (let i = 2; i < 1000; i++) {
    const candidate = `${stem}-${i}${ext}`
    if (!taken(candidate)) return candidate
  }
  throw new Error('No free file name.')
}

/**
 * Joins a wiki-relative path onto the root and refuses anything that escapes it. Every write
 * inside a wiki goes through this, so a slug or a model-supplied path can never leave the folder.
 */
export function safeJoin(root: string, rel: string): string {
  if (!rel || isAbsolute(rel) || /^[a-z]:/i.test(rel)) throw new Error('Path must be relative.')
  const full = normalize(join(root, rel))
  const back = relative(root, full)
  if (!back || back.startsWith('..') || isAbsolute(back)) throw new Error('Path escapes the wiki.')
  return full
}

/** Relative link from one wiki file to another, both wiki-relative. */
export function relLink(fromRel: string, toRel: string): string {
  const from = fromRel.split('/').slice(0, -1)
  const to = toRel.split('/')
  let i = 0
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++
  const up = from.slice(i).map(() => '..')
  const rest = to.slice(i)
  return [...up, ...rest].join('/') || toRel
}

/** Markdown link destination: angle brackets when the path has spaces or a parenthesis. */
export const linkDest = (p: string): string => (/[\s()]/.test(p) ? `<${p}>` : p)
