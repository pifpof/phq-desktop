import { randomBytes } from 'crypto'
import type { ErrorCode } from '@shared/errors'
import { emptyProfile } from '@shared/profile'
import {
  DEFAULT_BUDGET_USD,
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
  type RunView
} from '@shared/research'
import type { Logger } from '../log'
import { ProviderError, type Provider } from '../providers/types'
import { readProfile } from '../workspace/profile'
import { safeName } from '../workspace/safe-name'
import { ResearchEngine, type EngineDeps } from './engine'
import { estimateRun, type TaskKind } from './estimates'
import { createExecutor, makeContext, outputVerifier, type LocalRunner } from './executor'
import { priceFor, type Pricing } from './pricing'
import type { SkillReader } from './prompt-builder'
import { isUnfinished, latestRun, saveRun } from './run-store'
import { TASKS } from './tasks'
import type { LocalHandler, TaskDef } from './types'

/** Thrown for problems the person can act on. The IPC layer turns `code` into a message. */
export class ResearchError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string
  ) {
    super(message)
  }
}

export interface ServiceDeps {
  getRoot(): string | null
  getModel(): string | null
  getKey(): string | null
  provider(): Provider
  pricing(): Pricing
  readSkill: SkillReader
  local: Partial<Record<LocalHandler, LocalRunner>>
  /** Pushes the run to the window after every change. */
  send(run: RunView): void
  /** Called once when a run reaches done, failed or cancelled. */
  onFinished?(run: RunView): void
  log: Pick<Logger, 'info' | 'warn' | 'error'>
  tasks?: TaskDef[]
  engine?: Pick<EngineDeps, 'now' | 'sleep' | 'random'>
}

export interface Estimate {
  costUsd: { low: number; high: number }
  minutes: { low: number; high: number }
  searches: { low: number; high: number }
  tasks: number
  model: string
  /** False when the model is not in pricing.json, so the numbers are a guess. */
  modelKnown: boolean
  /** Null when the provider could not be asked (offline). */
  webSearch: boolean | null
  concurrency: number
  budgetCapUsd: number
  pricingUpdated: string
}

export interface StartOptions {
  budgetCapUsd?: number
  concurrency?: number
  /** Limit the run to these task IDs (see ResearchEngine `only`). */
  only?: string[]
}

/** What "Regenerate playbook" runs: read the files again, the seven sections, publishing, and the messaging analysis. */
export const PLAYBOOK_TASKS = [
  'extract-input-files',
  'playbook-01-market',
  'playbook-02-icp',
  'playbook-03-value',
  'playbook-04-moat',
  'playbook-05-statement',
  'playbook-06-competitive',
  'playbook-07-proof',
  'playbook-assemble',
  'messaging-analysis'
]

export interface CatalogEntry {
  taskId: string
  title: string
  /** Workspace-relative path of the output. A folder for competitor profiles. */
  path: string
  stage: number
}

const newRunId = (): string => {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${randomBytes(2).toString('hex')}`
}

export function createResearchService(d: ServiceDeps) {
  const tasks = d.tasks ?? TASKS
  let engine: ResearchEngine | null = null
  let loaded = false
  let notified = false

  const need = async (): Promise<{
    root: string
    model: string
    key: string
    profile: NonNullable<Awaited<ReturnType<typeof readProfile>>>
  }> => {
    const root = d.getRoot()
    if (!root) throw new ResearchError('no_workspace', 'Choose a workspace folder first.')
    const key = d.getKey()
    const model = d.getModel()
    if (!key || !model) throw new ResearchError('no_key', 'Reconnect your AI to continue.')
    const profile = await readProfile(root)
    if (!profile?.company.name.trim() || !profile.company.website.trim()) {
      throw new ResearchError('invalid_payload', 'Add your company name and website first.')
    }
    return { root, model, key, profile }
  }

  async function webSearchAvailable(key: string, model: string): Promise<boolean | null> {
    try {
      return (await d.provider().capabilities(key, model)).webSearch
    } catch (err) {
      // Wrong key or no access is the person's to fix. Anything else (offline) we cannot tell.
      if (
        err instanceof ProviderError &&
        (err.code === 'invalid_key' || err.code === 'no_permission')
      ) {
        throw new ResearchError(
          err.code,
          err.code === 'invalid_key'
            ? 'Reconnect your AI to continue.'
            : "This key doesn't have access."
        )
      }
      return null
    }
  }

  /** Everything an engine needs for a run in this workspace. */
  async function engineDeps(
    runId: string
  ): Promise<{ deps: EngineDeps; root: string; model: string }> {
    const { root, model, profile } = await need()
    const company = safeName(profile.company.name)
    const base = { root, profile, runId, company, tasks }
    const ctx = makeContext(base)
    const execute = createExecutor({
      ...base,
      model,
      provider: d.provider(),
      getKey: d.getKey,
      pricing: d.pricing(),
      readSkill: d.readSkill,
      local: d.local
    })
    const deps: EngineDeps = {
      ...d.engine,
      tasks,
      context: () => ctx,
      execute,
      verifyOutput: outputVerifier(root, ctx),
      // Error messages from our own code and the file system only. Model output never becomes an error message.
      onTaskError: (task, err) =>
        d.log.warn(
          `Task ${task.id} failed: ${err instanceof ProviderError ? err.code : err instanceof Error ? err.message.slice(0, 300) : 'unknown'}`
        ),
      save: (run) => saveRun(root, run),
      emit: (run) => {
        d.send(run)
        if (
          !notified &&
          (run.status === 'done' || run.status === 'failed' || run.status === 'cancelled')
        ) {
          notified = true
          d.log.info(`Research run ${run.id} ${run.status}: spent $${run.spentUsd.toFixed(2)}`)
          d.onFinished?.(run)
        }
      }
    }
    return { deps, root, model }
  }

  /** The latest run from disk, if it was interrupted, comes back paused so the person chooses to resume. */
  async function loadInterrupted(): Promise<void> {
    if (loaded) return
    loaded = true
    const root = d.getRoot()
    if (!root || engine) return
    const saved = await latestRun(root)
    if (!saved || !isUnfinished(saved)) return
    try {
      const { deps, model } = await engineDeps(saved.id)
      engine = await ResearchEngine.restore(
        deps,
        {
          runId: saved.id,
          model: saved.model || model,
          concurrency: saved.concurrency,
          budgetCapUsd: saved.budgetCapUsd
        },
        saved
      )
      notified = false
    } catch (err) {
      d.log.warn(
        `Could not restore research run: ${err instanceof Error ? err.message : 'unknown'}`
      )
    }
  }

  const active = (): ResearchEngine => {
    if (!engine) throw new ResearchError('internal', 'There is no research run.')
    return engine
  }

  return {
    async estimate(): Promise<Estimate> {
      const { model, key, profile } = await need()
      const competitors = Math.min(5, profile.company.competitors.length || 4)
      const kinds: TaskKind[] = tasks.flatMap((t) =>
        t.fanOut ? (Array(competitors).fill('web-profile') as TaskKind[]) : [t.kind]
      )
      const pricing = d.pricing()
      const e = estimateRun(kinds, model, pricing, DEFAULT_CONCURRENCY)
      return {
        costUsd: e.costUsd,
        minutes: e.minutes,
        searches: e.searches,
        tasks: e.tasks,
        model,
        modelKnown: priceFor(pricing, model).known,
        webSearch: await webSearchAvailable(key, model),
        concurrency: DEFAULT_CONCURRENCY,
        budgetCapUsd: DEFAULT_BUDGET_USD,
        pricingUpdated: pricing.lastUpdated
      }
    },

    async start(options: StartOptions = {}): Promise<RunView> {
      await loadInterrupted()
      if (engine && !engine.isFinished)
        throw new ResearchError('invalid_payload', 'A research run is already in progress.')
      const { key, model } = await need()
      const skipWeb = (await webSearchAvailable(key, model)) === false
      const runId = newRunId()
      const { deps } = await engineDeps(runId)
      notified = false
      engine = new ResearchEngine(deps, {
        runId,
        model,
        concurrency: Math.min(
          MAX_CONCURRENCY,
          Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY)
        ),
        budgetCapUsd: Math.max(0.01, options.budgetCapUsd ?? DEFAULT_BUDGET_USD),
        skipWeb,
        only: options.only ?? null
      })
      d.log.info(
        `Research run ${runId} started${skipWeb ? ' (web search unavailable, web tasks skipped)' : ''}`
      )
      engine.start()
      return engine.view()
    },

    /**
     * Runs some tasks again (or the playbook preset) as a new, scoped run. Everything else stays as it is on disk.
     * A competitor profile re-runs the whole set of profiles.
     */
    async rerun(target: { taskIds?: string[]; preset?: 'playbook' }): Promise<RunView> {
      const ids =
        target.preset === 'playbook'
          ? PLAYBOOK_TASKS
          : (target.taskIds ?? []).map((id) => id.split(':')[0])
      const unique = [...new Set(ids)]
      if (unique.length === 0 || unique.some((id) => !tasks.some((t) => t.id === id))) {
        throw new ResearchError('invalid_payload', 'There is nothing to run again.')
      }
      return this.start({ only: unique })
    },

    /** Every output the pipeline writes, for the Training Data list (missing files show as missing). */
    async catalog(): Promise<CatalogEntry[]> {
      const root = d.getRoot()
      if (!root) throw new ResearchError('no_workspace', 'Choose a workspace folder first.')
      const profile = await readProfile(root)
      const company = safeName(profile?.company.name ?? '')
      const ctx = makeContext({
        root,
        profile: profile ?? emptyProfile(),
        runId: '',
        company,
        tasks
      })
      const entries: CatalogEntry[] = tasks.map((t) => ({
        taskId: t.id,
        title: t.title,
        path: t.output(ctx),
        stage: t.stage
      }))
      entries.push({
        taskId: 'research-09-synthesis',
        title: 'Full company research',
        path: `memory/company-research/${company}.md`,
        stage: 3
      })
      return entries
    },

    async getRun(): Promise<RunView | null> {
      await loadInterrupted()
      if (engine) return engine.view()
      const root = d.getRoot()
      return root ? latestRun(root) : null
    },

    async pause(): Promise<void> {
      await loadInterrupted()
      active().pause()
    },
    async resume(options: { skipWeb?: boolean; budgetCapUsd?: number } = {}): Promise<void> {
      await loadInterrupted()
      await need()
      active().resume(options)
    },
    async cancel(): Promise<void> {
      await loadInterrupted()
      active().cancel()
    },
    async retryTask(taskId: string): Promise<void> {
      await loadInterrupted()
      active().retryTask(taskId)
    },
    async setBudget(budgetCapUsd: number): Promise<void> {
      await loadInterrupted()
      active().setBudget(Math.max(0.01, budgetCapUsd))
    },

    /** The workspace changed: forget the run so the next call looks at the new folder. */
    reset(): void {
      engine?.cancel()
      engine = null
      loaded = false
    },

    /** Waits for pending saves. Used on quit and in tests. */
    async flush(): Promise<void> {
      await engine?.flush()
    },

    /** Aborts running tasks and requeues them without cancelling the run, so it can be resumed. Used on quit. */
    interrupt(): void {
      if (engine && !engine.isFinished) engine.interrupt()
    }
  }
}

export type ResearchService = ReturnType<typeof createResearchService>
