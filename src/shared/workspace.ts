import { z } from 'zod'

/** REQUIREMENTS-v2 2.2. */
export const WORKSPACE_KINDS = [
  'empty',
  /** A PositioningHQ wiki at the supported format version, with research in it. */
  'phq-complete',
  /** A PositioningHQ wiki at the supported format version, nothing researched yet. */
  'phq-incomplete',
  /** Made by a newer app: opened read-only. */
  'phq-newer',
  /** An older format version: needs its format migration. */
  'phq-older',
  /** A v1 app workspace (.positioninghq/ and memory/): needs the v1 migration. */
  'v1-workspace',
  /** An old skill-pack vault (vault.config.md, memory/, inputs/): needs the v1 migration. */
  'skillpack-vault',
  /** An llm-wiki topic wiki about something else. */
  'other-wiki',
  'non-empty'
] as const
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number]

export const DetectionSchema = z.object({
  kind: z.enum(WORKSPACE_KINDS),
  /** From config.md, vault.config.md or the v1 profile, when known. */
  company: z.object({ name: z.string(), website: z.string() }).nullable(),
  /** format_version found in config.md, for PositioningHQ wikis. */
  formatVersion: z.number().nullable().default(null)
})
export type Detection = z.infer<typeof DetectionSchema>

export const DocMetaSchema = z.object({
  /** Path relative to the workspace, with forward slashes. */
  path: z.string(),
  title: z.string(),
  frontMatter: z.record(z.string(), z.unknown()),
  mtime: z.number()
})
export type DocMeta = z.infer<typeof DocMetaSchema>

export const DocSchema = DocMetaSchema.extend({ body: z.string() })
export type Doc = z.infer<typeof DocSchema>

export const INPUT_CATEGORIES = [
  'sales collateral',
  'customer references',
  'competitive-intel',
  'company strategy',
  'roadmap',
  'help-docs'
] as const
export type InputCategory = (typeof INPUT_CATEGORIES)[number]

export const INPUT_LIMITS = { maxFileBytes: 25 * 1024 * 1024, maxFiles: 50 } as const
/** Extensions the app can read. Others are copied but marked "not read". */
export const READABLE_EXTENSIONS = ['pdf', 'docx', 'pptx', 'md', 'txt', 'csv'] as const

export const InputFileSchema = z.object({
  name: z.string(),
  size: z.number(),
  readable: z.boolean()
})
export type InputFile = z.infer<typeof InputFileSchema>

export const AddResultSchema = z.object({
  added: z.array(InputFileSchema),
  refused: z.array(z.object({ name: z.string(), reason: z.string() }))
})
export type AddResult = z.infer<typeof AddResultSchema>

export const InputCategorySchema = z.enum(INPUT_CATEGORIES)
