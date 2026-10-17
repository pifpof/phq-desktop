import { z } from 'zod'

/** PositioningHQ Wiki Format (docs/v2/WIKI-FORMAT-SPEC.md). Bump only with a spec change. */
export const FORMAT_VERSION = 1

export const CATEGORIES = ['concept', 'topic', 'reference'] as const
export type Category = (typeof CATEGORIES)[number]

/** `repos` is required by llm-wiki lint but never written by PositioningHQ. */
export const RAW_TYPES = ['articles', 'papers', 'repos', 'notes', 'data'] as const
export type RawType = (typeof RAW_TYPES)[number]

export const CONFIDENCE = ['high', 'medium', 'low'] as const
export type Confidence = (typeof CONFIDENCE)[number]

export const VOLATILITY = ['hot', 'warm', 'cold'] as const
export type Volatility = (typeof VOLATILITY)[number]

export const COMPILED_FROM = ['sources', 'conversation', 'mixed'] as const
export type CompiledFrom = (typeof COMPILED_FROM)[number]

/** Folder under wiki/ for each category. */
export const CATEGORY_DIR: Record<Category, string> = {
  concept: 'concepts',
  topic: 'topics',
  reference: 'references'
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates are YYYY-MM-DD.')
const nonEmpty = z.string().trim().min(1)
const tags = z.array(nonEmpty).min(1)
/** Paths are relative to the wiki root, forward slashes, never URLs. */
const wikiPath = nonEmpty.refine((p) => !/^[a-z]+:\/\//i.test(p) && !p.startsWith('/'), {
  message: 'Paths are relative to the wiki root, never URLs.'
})

/** Spec 4.1. Key order here is the order written to disk. */
export const RawFrontMatterSchema = z.object({
  title: nonEmpty,
  source: nonEmpty,
  type: z.enum(RAW_TYPES),
  ingested: isoDate,
  tags,
  summary: nonEmpty
})
export type RawFrontMatter = z.infer<typeof RawFrontMatterSchema>

/** Spec 4.2. Either sources or compiled-from: conversation. */
export const ArticleFrontMatterSchema = z
  .object({
    title: nonEmpty,
    category: z.enum(CATEGORIES),
    sources: z.array(wikiPath).optional(),
    created: isoDate,
    updated: isoDate,
    tags,
    aliases: z.array(nonEmpty),
    confidence: z.enum(CONFIDENCE),
    volatility: z.enum(VOLATILITY),
    verified: isoDate,
    'compiled-from': z.enum(COMPILED_FROM),
    summary: nonEmpty
  })
  .refine(
    (a) => (a.sources?.length ?? 0) > 0 || a['compiled-from'] !== 'sources',
    'An article needs sources, or compiled-from: conversation or mixed.'
  )
export type ArticleFrontMatter = z.infer<typeof ArticleFrontMatterSchema>

/** Spec 4.5. Outputs cite wiki articles. */
export const OutputFrontMatterSchema = z.object({
  title: nonEmpty,
  type: nonEmpty,
  created: isoDate,
  updated: isoDate,
  summary: nonEmpty,
  sources: z.array(wikiPath)
})
export type OutputFrontMatter = z.infer<typeof OutputFrontMatterSchema>

export const ConfigFrontMatterSchema = z.object({
  title: nonEmpty,
  description: nonEmpty,
  created: isoDate,
  format_version: z.number().int().positive()
})
export type ConfigFrontMatter = z.infer<typeof ConfigFrontMatterSchema>

export const SchemaFrontMatterSchema = z.object({
  title: nonEmpty,
  schema_state: z.enum(['advisory', 'strict']),
  created: isoDate,
  updated: isoDate,
  summary: nonEmpty
})

/** The keys each kind of file may carry, in write order. Anything else is dropped on write. */
export const KEYS = {
  raw: Object.keys(RawFrontMatterSchema.shape),
  article: [
    'title',
    'category',
    'sources',
    'created',
    'updated',
    'tags',
    'aliases',
    'confidence',
    'volatility',
    'verified',
    'compiled-from',
    'summary'
  ],
  output: Object.keys(OutputFrontMatterSchema.shape),
  config: Object.keys(ConfigFrontMatterSchema.shape),
  schema: Object.keys(SchemaFrontMatterSchema.shape)
} as const
export type FileKind = keyof typeof KEYS
