import type { ArticleFrontMatter } from '@shared/wiki-types'
import { stringifyDoc } from './frontmatter'
import { link, rawLink, type LinkTarget } from './links'

/** Body shape for every article (spec 6.6): title, abstract, sections, See Also, Sources. */

export interface SeeAlso {
  target: LinkTarget
  note: string
}

export interface SourceRef {
  /** Wiki-relative raw path. */
  path: string
  title: string
  note?: string
}

export interface ArticleInput {
  path: string
  frontMatter: ArticleFrontMatter
  /** One paragraph. An agent that reads only this should get the point. */
  abstract: string
  /** Markdown sections (## headings), without See Also or Sources. */
  sections: string
  seeAlso: SeeAlso[]
  sources: SourceRef[]
}

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim()

export function renderArticleBody(a: ArticleInput): string {
  const parts = [`# ${oneLine(a.frontMatter.title)}`, '', `> ${oneLine(a.abstract)}`, '']
  if (a.sections.trim()) parts.push(a.sections.trim(), '')
  if (a.seeAlso.length) {
    parts.push('## See Also', '')
    for (const s of a.seeAlso)
      parts.push(`- ${link(a.path, s.target)}${s.note ? ` - ${oneLine(s.note)}` : ''}`)
    parts.push('')
  }
  if (a.sources.length) {
    parts.push('## Sources', '')
    for (const s of a.sources)
      parts.push(`- ${rawLink(a.path, s.path, s.title)}${s.note ? ` - ${oneLine(s.note)}` : ''}`)
    parts.push('')
  }
  return parts.join('\n')
}

export const renderArticle = (a: ArticleInput): string =>
  stringifyDoc('article', a.frontMatter, renderArticleBody(a))
