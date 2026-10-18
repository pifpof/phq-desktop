import { z } from 'zod'

/**
 * The Wiki pane's trees (REQUIREMENTS-v3 3 to 5). Built in main from front matter and file
 * times; the renderer only draws them.
 */

/** Article tree sections, in display order (REQUIREMENTS-v3 3.1). */
export const NAV_SECTIONS = [
  { id: 'positioning', label: 'Positioning' },
  { id: 'customers', label: 'Customers' },
  { id: 'competitors', label: 'Competitors' },
  { id: 'messaging', label: 'Messaging today' },
  { id: 'market', label: 'Market' },
  { id: 'company', label: 'Your company' },
  { id: 'other', label: 'Other' }
] as const
export type NavSection = (typeof NAV_SECTIONS)[number]['id']

/** Parents with no article of their own. */
export const VIRTUAL_PARENTS = {
  moats: { label: 'Moats', section: 'positioning', order: 3 },
  decisions: { label: 'Decisions', section: 'positioning', order: 5 },
  'competitor-profiles': { label: 'Competitor Profiles', section: 'competitors', order: 2 }
} as const satisfies Record<string, { label: string; section: NavSection; order: number }>
export type VirtualParent = keyof typeof VIRTUAL_PARENTS

/** Status markers in priority order (REQUIREMENTS-v3 3.5). */
export const MARKER_KINDS = [
  'missing',
  'outOfDate',
  'lowConfidence',
  'decision',
  'private'
] as const
export const MarkerSchema = z.object({
  kind: z.enum(MARKER_KINDS),
  /** Text equivalent, for the tooltip and screen readers. */
  text: z.string()
})
export type Marker = z.infer<typeof MarkerSchema>

export const SOURCE_KINDS = ['page', 'citation', 'file', 'social', 'legacy', 'other'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]

export const TreeSourceSchema = z.object({
  path: z.string(),
  title: z.string(),
  kind: z.enum(SOURCE_KINDS),
  private: z.boolean(),
  /** False when an article cites a file that is not there. */
  exists: z.boolean(),
  ingested: z.string()
})
export type TreeSource = z.infer<typeof TreeSourceSchema>

export interface TreeNode {
  /** The article path, `missing:<slug>` for a placeholder, or `group:<id>` for a virtual parent. */
  id: string
  kind: 'article' | 'placeholder' | 'group'
  slug: string | null
  path: string | null
  label: string
  /** Full title (or the label, for a group). */
  title: string
  subtitle: string
  summary: string
  aliases: string[]
  markers: Marker[]
  sources: TreeSource[]
  /** Task that writes it, for Re-run and Generate. Null for app-written articles and groups. */
  taskId: string | null
  /** Any descendant out of date or low confidence (the amber dot on parents). */
  attention: boolean
  children: TreeNode[]
}

export const TreeNodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    kind: z.enum(['article', 'placeholder', 'group']),
    slug: z.string().nullable(),
    path: z.string().nullable(),
    label: z.string(),
    title: z.string(),
    subtitle: z.string(),
    summary: z.string(),
    aliases: z.array(z.string()),
    markers: z.array(MarkerSchema),
    sources: z.array(TreeSourceSchema),
    taskId: z.string().nullable(),
    attention: z.boolean(),
    children: z.array(TreeNodeSchema)
  })
)

export const TreeSectionSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** Articles inside, placeholders and groups not counted. */
  count: z.number(),
  attention: z.boolean(),
  items: z.array(TreeNodeSchema)
})
export type TreeSection = z.infer<typeof TreeSectionSchema>

export const WikiTreeSchema = z.object({ sections: z.array(TreeSectionSchema) })
export type WikiTree = z.infer<typeof WikiTreeSchema>

/** Sources tab (REQUIREMENTS-v3 4). */
export const SOURCE_SECTIONS = [
  { id: 'own-site', label: 'Your website' },
  { id: 'files', label: 'Your files' },
  { id: 'competitor-sites', label: 'Competitor sites' },
  { id: 'citations', label: 'Web citations' },
  { id: 'social', label: 'Social' },
  { id: 'legacy', label: 'Legacy' },
  { id: 'other', label: 'Other' }
] as const

export const CitedBySchema = z.object({ path: z.string(), label: z.string() })

export const SourceNodeSchema = TreeSourceSchema.extend({
  summary: z.string(),
  citedBy: z.array(CitedBySchema)
})
export type SourceNode = z.infer<typeof SourceNodeSchema>

export const SourceGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  sources: z.array(SourceNodeSchema)
})
export type SourceGroup = z.infer<typeof SourceGroupSchema>

export const SourceSectionSchema = z.object({
  id: z.string(),
  label: z.string(),
  count: z.number(),
  /** Sources directly under the heading. */
  sources: z.array(SourceNodeSchema),
  /** Subgroups: user files by category, competitor pages by competitor. */
  groups: z.array(SourceGroupSchema)
})
export type SourceSection = z.infer<typeof SourceSectionSchema>

export const SourcesTreeSchema = z.object({ sections: z.array(SourceSectionSchema) })
export type SourcesTree = z.infer<typeof SourcesTreeSchema>

/**
 * Which parts of the Wiki pane are open, per workspace (REQUIREMENTS-v3 3.3). Sections and
 * parents start expanded, so they are listed when collapsed; source lists start collapsed, so
 * they are listed when open.
 */
export const NavStateSchema = z.object({
  collapsed: z.array(z.string().max(600)).max(2000),
  open: z.array(z.string().max(600)).max(2000)
})
export type NavState = z.infer<typeof NavStateSchema>
