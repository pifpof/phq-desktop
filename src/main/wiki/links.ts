import { linkDest, relLink } from './paths'

/**
 * Two-form links (spec 6.6): `[[slug|Title]] ([Title](relative/path.md))`. The wikilink serves
 * Obsidian; the markdown link serves GitHub, plain editors and llm-wiki's link check.
 */

export interface LinkTarget {
  slug: string
  title: string
  /** Wiki-relative path of the target, e.g. wiki/topics/ideal-customer-profile.md */
  path: string
}

/** Characters that would end a wikilink or a link label early. */
const safeTitle = (t: string): string =>
  t
    .replace(/[[\]|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export function link(fromPath: string, target: LinkTarget): string {
  const title = safeTitle(target.title) || target.slug
  return `[[${target.slug}|${title}]] ([${title}](${linkDest(relLink(fromPath, target.path))}))`
}

/** A plain markdown link to a raw file, for the Sources section. */
export function rawLink(fromPath: string, rawPath: string, title: string): string {
  const label = safeTitle(title) || rawPath.split('/').pop() || rawPath
  return `[${label}](${linkDest(relLink(fromPath, rawPath))})`
}

export interface FoundLink {
  /** Slug from a wikilink, if any. */
  slug: string | null
  /** Target of a markdown link, resolved to a wiki-relative path, if any. */
  path: string | null
  /** The full matched text. */
  text: string
}

const TWO_FORM = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]\s*\(\[[^\]]*\]\((<[^>\n]+>|[^)\n]+)\)\)/g
const WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g
const MDLINK = /(?<!!)\[[^\]\n]*\]\((<[^>\n]+>|[^)\s\n]+)(?:\s+"[^"]*")?\)/g

/** Resolves a relative link target against the linking file. Null for URLs and anchors. */
export function resolveRel(fromPath: string, target: string): string | null {
  let t = target.startsWith('<') && target.endsWith('>') ? target.slice(1, -1) : target
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith('#')) return null
  t = t.split('#')[0]
  try {
    t = decodeURI(t)
  } catch {
    /* keep as written */
  }
  const parts = fromPath.split('/').slice(0, -1)
  for (const seg of t.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (!parts.length) return null
      parts.pop()
    } else parts.push(seg)
  }
  return parts.join('/')
}

/** Every link in a body, two-form links counted once. */
export function parseLinks(fromPath: string, body: string): FoundLink[] {
  const found: FoundLink[] = []
  let rest = body.replace(TWO_FORM, (text, slug: string, _title, dest: string) => {
    found.push({ slug: slug.trim(), path: resolveRel(fromPath, dest), text })
    return ' '
  })
  rest = rest.replace(WIKILINK, (text, slug: string) => {
    found.push({ slug: slug.trim(), path: null, text })
    return ' '
  })
  for (const m of rest.matchAll(MDLINK)) {
    found.push({ slug: null, path: resolveRel(fromPath, m[1]), text: m[0] })
  }
  return found
}

/** Slugs a body links to (wikilinks, and markdown links to wiki/ articles). */
export function linkedSlugs(fromPath: string, body: string): string[] {
  const slugs = new Set<string>()
  for (const l of parseLinks(fromPath, body)) {
    if (l.slug) slugs.add(l.slug)
    else if (l.path?.startsWith('wiki/') && l.path.endsWith('.md'))
      slugs.add(l.path.split('/').pop()!.slice(0, -3))
  }
  return [...slugs]
}

/** Articles that link to `slug`. `docs` maps each article path to its body. */
export function backlinks(slug: string, docs: { path: string; body: string }[]): string[] {
  return docs
    .filter((d) => !d.path.endsWith(`/${slug}.md`) && linkedSlugs(d.path, d.body).includes(slug))
    .map((d) => d.path)
    .sort()
}
