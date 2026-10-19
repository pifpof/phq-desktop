import { z } from 'zod'
import type { OutputTool } from '../providers/types'
import type { PlaybookExtras } from './assemble-playbook'
import { PLAYBOOK_STEPS } from '../wiki/article-map'
import { stringifyDoc, stringList } from '../wiki/frontmatter'
import { checkTakeaways, GAP_HEADING, TAKEAWAYS_HEADING } from '../wiki/sections'
import { extrasFrom } from '../state/playbook-extras'
import {
  splitSections,
  takeawaysMarkdown,
  withoutSections,
  type ExistingArticle,
  type PreparedFile
} from './article-output'
import type { PromptDocument } from './prompt-builder'

/**
 * Adding key takeaways and gaps to an existing playbook (REQUIREMENTS-v4 7.3): one small no-web
 * task over the section articles. It returns takeaways and gaps only, through a schema-only tool;
 * main merges them into the articles without touching any other body text. Runs as a
 * regeneration, so the founder reviews the result before anything is written.
 */

export const TAKEAWAYS_TASK = 'playbook-takeaways'
export const TAKEAWAYS_TOOL_NAME = 'write_takeaways'

const GAP = {
  type: 'object',
  description: 'Only where the article shows a clear weakness. Leave it out when there is none.',
  properties: {
    problem: { type: 'string', description: 'One or two sentences grounded in the article.' },
    next_step: {
      type: 'string',
      description: 'One concrete action that would move this up one level.'
    }
  },
  required: ['problem', 'next_step']
}

export const TAKEAWAYS_TOOL: OutputTool = {
  name: TAKEAWAYS_TOOL_NAME,
  description:
    'Saves key takeaways and gaps for the playbook section articles. Call it once with every article listed. The app checks and writes them.',
  schema: {
    type: 'object',
    properties: {
      articles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            slug: { type: 'string' },
            takeaways: {
              type: 'array',
              items: { type: 'string' },
              description: 'Exactly three lines, each at most 12 words.'
            },
            gap: GAP
          },
          required: ['slug', 'takeaways']
        }
      },
      section: {
        type: 'object',
        description: 'Distinct Advantages as a whole, from the moat articles, when they are given.',
        properties: { takeaways: { type: 'array', items: { type: 'string' } }, gap: GAP },
        required: ['takeaways']
      }
    },
    required: ['articles']
  }
}

const Gap = z.object({ problem: z.string(), next_step: z.string() })
const OutSchema = z.object({
  articles: z
    .array(
      z.object({
        slug: z.string(),
        takeaways: z.array(z.string()).optional(),
        gap: Gap.optional().catch(undefined)
      })
    )
    .optional()
    .default([]),
  section: z
    .object({ takeaways: z.array(z.string()).optional(), gap: Gap.optional().catch(undefined) })
    .optional()
    .catch(undefined)
})

/** The articles the task reads and writes takeaways for. */
export function takeawayArticles(articles: Map<string, ExistingArticle>): {
  sections: ExistingArticle[]
  moats: ExistingArticle[]
} {
  const sections = PLAYBOOK_STEPS.filter((s) => s.takeaways && s.slug)
    .map((s) => articles.get(s.slug))
    .filter((a): a is ExistingArticle => !!a)
  const moats = [...articles.values()]
    .filter((a) => a.slug.startsWith('moat-'))
    .sort((a, b) => a.slug.localeCompare(b.slug))
  return { sections, moats }
}

export function takeawayDocuments(a: {
  sections: ExistingArticle[]
  moats: ExistingArticle[]
}): PromptDocument[] {
  return [...a.sections, ...a.moats].map((x) => ({
    path: x.path,
    content: x.body.trim(),
    rawSources: stringList(x.data.sources),
    private: stringList(x.data.tags).includes('private')
  }))
}

/** What the model is asked for, after the documents. */
export function takeawaysInstruction(a: {
  sections: ExistingArticle[]
  moats: ExistingArticle[]
}): string {
  return [
    'Add key takeaways and gaps to this positioning playbook. Do not rewrite the articles.',
    `In ${TAKEAWAYS_TOOL_NAME}, return one entry in articles for each of these slugs: ${a.sections.map((s) => s.slug).join(', ')}.`,
    a.moats.length
      ? 'Also fill section for Distinct Advantages as a whole, from the moat articles.'
      : '',
    '- takeaways: exactly three lines, each at most 12 words. Each must be supported by what the article says. Do not restate the title or repeat the abstract.',
    '- gap: only where the article shows a clear weakness, such as low confidence, missing proof, an over-broad ideal customer, or unclear differentiation. problem: one or two sentences grounded in the article and its evidence. next_step: one concrete action the founder can take that would move this up one level, and that works without buying anything. Leave gap out when there is no clear weakness.',
    '- Never invent scores, figures or facts. No em dashes. Plain, direct words.'
  ]
    .filter(Boolean)
    .join('\n')
}

const toCheck = (g: z.infer<typeof Gap> | undefined) =>
  g ? { problem: g.problem, nextStep: g.next_step } : undefined

/** Checks the tool output. Errors go back to the model for one retry. */
export function readTakeawaysOutput(
  raw: unknown,
  a: { sections: ExistingArticle[]; moats: ExistingArticle[] }
): {
  entries: Map<string, { takeaways: string[]; gap: z.infer<typeof Gap> | undefined }>
  section: PlaybookExtras[keyof PlaybookExtras] | null
  errors: string[]
} {
  const errors: string[] = []
  const entries = new Map<string, { takeaways: string[]; gap: z.infer<typeof Gap> | undefined }>()
  const parsed = OutSchema.safeParse(raw ?? {})
  if (!parsed.success)
    return {
      entries,
      section: null,
      errors: [`The ${TAKEAWAYS_TOOL_NAME} arguments did not match the schema.`]
    }
  for (const s of a.sections) {
    const e = parsed.data.articles.find((x) => x.slug.trim() === s.slug)
    if (!e) {
      errors.push(`${s.slug}: missing.`)
      continue
    }
    const problems = checkTakeaways(e.takeaways, toCheck(e.gap))
    if (problems.length) errors.push(...problems.map((p) => `${s.slug}: ${p}`))
    else entries.set(s.slug, { takeaways: e.takeaways!, gap: e.gap })
  }
  let section: PlaybookExtras[keyof PlaybookExtras] | null = null
  if (a.moats.length) {
    const sec = parsed.data.section
    const problems = checkTakeaways(sec?.takeaways, toCheck(sec?.gap))
    if (problems.length) errors.push(...problems.map((p) => `section: ${p}`))
    else section = extrasFrom(sec!.takeaways!, sec!.gap)
  }
  return { entries, section, errors }
}

/** The article with Key takeaways and Gap to close set right after the abstract; nothing else changes. */
export function withTakeaways(
  a: ExistingArticle,
  takeaways: string[],
  gap: z.infer<typeof Gap> | undefined,
  today: string
): PreparedFile {
  const { head } = splitSections(a.body)
  const rest = withoutSections(a.body, [TAKEAWAYS_HEADING, GAP_HEADING])
    .slice(head.trim().length)
    .trim()
  const body = [head.trim(), takeawaysMarkdown(takeaways, gap), rest].filter(Boolean).join('\n\n')
  return {
    slug: a.slug,
    path: a.path,
    text: stringifyDoc('article', { ...a.data, updated: today }, body),
    sources: stringList(a.data.sources)
  }
}
