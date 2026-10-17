import type { ArticleTargets } from './article-output'
import type { Profile } from '@shared/profile'
import type { InputCategory } from '@shared/workspace'
import type { TaskKind } from './estimates'

/** What a task can see when it runs. Reads are always inside the workspace. */
export interface TaskContext {
  profile: Profile
  runId: string
  /** File-name-safe company name, used in output paths. */
  company: string
  /** Output of an earlier task, or null when it is missing (skipped, failed or deleted). */
  readOutput(taskId: string): Promise<string | null>
}

export type LocalHandler = 'crawl' | 'extract' | 'assemble-playbook'

export interface WebTools {
  search: { maxUses: number }
  fetch?: { maxUses: number; maxContentTokens: number }
}

export interface TaskDef {
  id: string
  title: string
  /** Display grouping, 1 to 5 (REQUIREMENTS-v1 3.1). */
  stage: 1 | 2 | 3 | 4 | 5
  kind: TaskKind
  dependsOn: string[]

  /** A task that runs on this computer and calls no AI. */
  local?: LocalHandler

  // AI tasks
  skill?: string
  rules?: string[]
  asset?: string
  instruction?: string
  /** Earlier outputs and user files this task is shown. */
  inputs?: {
    /** Task outputs that must exist (a missing one is simply left out of the prompt). */
    outputs: string[]
    /** Task outputs used when present, without waiting for them. */
    optionalOutputs?: string[]
    /** User file categories shown to this task. Never combined with web tools. */
    inputCategories: InputCategory[]
  }
  /** Web search and fetch for this task, or false for none. */
  web: false | WebTools
  /** A local step that runs right after this AI task's output is written (assembling a combined document). */
  after?: LocalHandler
  /** Mark this task's documents as a prompt cache breakpoint (many tasks share them). */
  cacheDocuments?: boolean

  /**
   * Checks the model's answer before it is saved. Returns what is wrong, or null.
   * A failing answer is retried once with the problem explained; a second failure is saved with a note.
   */
  validate?: (text: string) => string | null

  /**
   * Where the answer goes (REQUIREMENTS-v2 3.3). Articles: wiki articles through the output tool.
   * Output: an assembled deliverable in output/ (versioned). Absent: a run draft in app state.
   * Article and output tasks also leave a receipt at `output()` listing what they wrote.
   */
  writes?:
    | { kind: 'articles'; targets: ArticleTargets; socialNotes?: boolean }
    | { kind: 'output'; name: string; title: string }

  /** Raw sources with any of these tags are shown too (never private ones). */
  rawTags?: string[]

  /** For a competitor's profile: whose pages are "competitor-site" when cited (REQUIREMENTS-v2 3.1). */
  competitor?: { slug: string; website: string }

  /** Workspace-relative path of the main output. */
  output(ctx: TaskContext): string

  /**
   * A group task creates one child per item once its dependencies are done
   * (one competitor profile per competitor). The group is done when its children are.
   */
  fanOut?: (ctx: TaskContext) => Promise<TaskDef[]> | TaskDef[]
}

export interface TaskOutcome {
  costUsd: number
  usage?: unknown
  /** Workspace-relative path written. */
  output: string | null
  /** Free-form note shown on the progress screen, such as "Output was cut off". */
  note?: string
}
