import { z } from 'zod'

/**
 * The Wiki pane's trees (REQUIREMENTS-v3 3 to 5). Built in main from front matter and file
 * times; the renderer only draws them.
 */

/** Article tree sections, in display order (REQUIREMENTS-v3 3.1). */
export const NAV_SECTIONS = [
  {
    id: 'positioning',
    label: 'Positioning',
    help: 'Your position: who you are for, the value you deliver, and the proof behind it.'
  },
  { id: 'customers', label: 'Customers', help: 'Who you are for, and who buys in your market.' },
  {
    id: 'competitors',
    label: 'Competitors',
    help: 'The alternatives buyers consider, and how you compare.'
  },
  { id: 'messaging', label: 'Messaging today', help: 'What you say about yourself today.' },
  {
    id: 'market',
    label: 'Market',
    help: 'The market you sell into, and why your offer matters now.'
  },
  {
    id: 'company',
    label: 'Your company',
    help: 'Facts about your company, from what you told the app and from the research.'
  },
  { id: 'other', label: 'Other', help: 'Articles added outside the app, or by another tool.' }
] as const
export type NavSection = (typeof NAV_SECTIONS)[number]['id']

/** Parents with no article of their own. */
export const VIRTUAL_PARENTS = {
  moats: {
    label: 'Moats',
    section: 'positioning',
    order: 3,
    help: 'Advantages competitors would find hard to copy.'
  },
  'competitor-profiles': {
    label: 'Competitor Profiles',
    section: 'competitors',
    order: 2,
    help: 'One article per competitor: what they offer, how they position, and how you compare.'
  }
} as const satisfies Record<
  string,
  { label: string; section: NavSection; order: number; help: string }
>
export type VirtualParent = keyof typeof VIRTUAL_PARENTS

/** Status markers in priority order (REQUIREMENTS-v3 3.5). */
export const MARKER_KINDS = [
  'missing',
  'outOfDate',
  'lowConfidence',
  'pendingChange',
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
  /** What this article is for, in plain words (the tooltip). */
  help: string
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
    help: z.string(),
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
  help: z.string(),
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
  {
    id: 'own-site',
    label: 'Your website',
    help: 'Pages from your website, saved when the research read them.'
  },
  {
    id: 'files',
    label: 'Your files',
    help: 'Files you added. They stay private and are never sent to web research.'
  },
  {
    id: 'competitor-sites',
    label: 'Competitor sites',
    help: "Pages from competitors' websites, grouped by competitor."
  },
  {
    id: 'citations',
    label: 'Web citations',
    help: 'Excerpts from web pages the research cited. Not full copies of the pages.'
  },
  { id: 'social', label: 'Social', help: 'Your social profiles, as the research found them.' },
  {
    id: 'legacy',
    label: 'Legacy',
    help: 'Material carried over from the old workspace format.'
  },
  { id: 'other', label: 'Other', help: 'Other files in the raw folder.' }
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
  help: z.string(),
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
  open: z.array(z.string().max(600)).max(2000),
  /** Changes tab: list regeneration events too (REQUIREMENTS-v3.1 3.6). */
  showRegenerations: z.boolean().optional()
})
export type NavState = z.infer<typeof NavStateSchema>
