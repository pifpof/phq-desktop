import { writeFile } from 'fs/promises'
import type { DecisionInput } from '@shared/wiki-views'
import type { ArticleFrontMatter } from '@shared/wiki-types'
import { renderArticle } from '../wiki/article'
import { writeIndexes } from '../wiki/index-gen'
import { appendLog } from '../wiki/log'
import { freeRel, isoDay, relLink, safeJoin, slugify } from '../wiki/paths'
import { addBacklinks, loadArticles } from './article-output'
import { replaceEmDashes } from './postprocess'

/**
 * Decision articles (spec 6.4, REQUIREMENTS-v2 3.5): a positioning choice the founder made,
 * recorded as a reference article. Every generation task that writes an affected article is
 * shown the decision and told not to contradict it.
 */

const oneLine = (s: string): string => replaceEmDashes(s.replace(/\s+/g, ' ').trim())

const firstSentence = (s: string): string => {
  const t = oneLine(s)
  const m = /^(.{20,200}?[.!?])(\s|$)/.exec(t)
  return m ? m[1] : t.slice(0, 200)
}

export interface DecisionDraft {
  path: string
  slug: string
  text: string
}

/** Renders the decision article (the preview the founder approves). Writes nothing. */
export async function draftDecision(
  wikiRoot: string,
  input: DecisionInput,
  date: string = isoDay()
): Promise<DecisionDraft> {
  const existing = await loadArticles(wikiRoot)
  const base = `decision-${date}-${slugify(input.title, 'decision').slice(0, 50).replace(/-+$/, '')}`
  const rel = await freeRel(wikiRoot, `wiki/references/${base}.md`)
  const slug = rel.split('/').pop()!.replace(/\.md$/, '')
  const affected = [...new Set(input.affects)].map((s) => existing.get(s)).filter((a) => !!a)
  const frontMatter: ArticleFrontMatter = {
    title: `Decision: ${oneLine(input.title)}`,
    category: 'reference',
    created: date,
    updated: date,
    tags: ['decision', ...affected.map((a) => slugify(a!.slug))].slice(0, 8),
    aliases: [],
    confidence: 'high',
    volatility: 'cold',
    verified: date,
    'compiled-from': 'conversation',
    summary: firstSentence(input.decided)
  }
  const links = affected.map((a) => ({
    target: { slug: a!.slug, title: a!.title, path: a!.path },
    note: ''
  }))
  const text = renderArticle({
    path: rel,
    frontMatter,
    abstract: `The founder decided: ${firstSentence(input.decided)}`,
    sections: [
      '## What was decided',
      '',
      replaceEmDashes(input.decided.trim()),
      '',
      '## Why',
      '',
      replaceEmDashes(input.why.trim()) || 'No reason was recorded.',
      '',
      '## What it affects',
      '',
      ...(affected.length
        ? affected.map(
            (a) => `- [[${a!.slug}|${a!.title}]] ([${a!.title}](${relLink(rel, a!.path)}))`
          )
        : ['- Nothing specific yet.'])
    ].join('\n'),
    seeAlso: links,
    sources: []
  })
  return { path: rel, slug, text }
}

/** Writes the decision, links the affected articles back to it, logs it. */
export async function recordDecision(
  wikiRoot: string,
  input: DecisionInput,
  date: string = isoDay()
): Promise<string> {
  const d = await draftDecision(wikiRoot, input, date)
  await writeFile(safeJoin(wikiRoot, d.path), d.text, { flag: 'wx' })
  await addBacklinks(wikiRoot, [d.path])
  await appendLog(wikiRoot, 'decision', `${oneLine(input.title)} (${d.path})`, date)
  await writeIndexes(wikiRoot)
  return d.path
}
