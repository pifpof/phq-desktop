import { randomBytes } from 'crypto'
import type { ErrorCode } from '@shared/errors'
import { emptyProfile } from '@shared/profile'
import {
  DEFAULT_BUDGET_USD,
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
  missingDeps,
  type DoneStats,
  type Finding,
  type RunKind,
  type RunView,
  type StepState
} from '@shared/research'
import type { Logger } from '../log'
import { ProviderError, type Provider } from '../providers/types'
import { join } from 'path'
import { RunSources } from '../ingest/citations-to-raw'
import { stateDir, writeJsonAtomic } from '../state/app-state'
import { readProvenance } from '../state/provenance'
import { checkWiki } from '../wiki/conformance'
import { writeIndexes } from '../wiki/index-gen'
import { reciprocateSeeAlso } from './article-output'
import { appendLog } from '../wiki/log'
import { isoDay } from '../wiki/paths'
import { readProfile } from '../workspace/profile'
import { safeName } from '../workspace/safe-name'
import { ResearchEngine, type EngineDeps } from './engine'
import { estimateRun, type TaskKind } from './estimates'
import type { PlanDeps } from './regen-plan'
import type { RegenDeps } from './executor'
import { finishRun, readJob } from './regen-job'
import { createExecutor, makeContext, outputVerifier, type LocalRunner } from './executor'
import { priceFor, type Pricing } from './pricing'
import type { SkillReader } from './prompt-builder'
import { isUnfinished, latestRun, listRuns, loadRun, saveRun } from './run-store'
import { buildDoneStats } from './done-stats'
import { buildFindings } from './findings'
import { stepStates } from './task-states'
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
  /** Called once when a run publishes the playbook (REQUIREMENTS-v4.4 3.1). Not for regenerations. */
  onPlaybookReady?(run: RunView): void
  log: Pick<Logger, 'info' | 'warn' | 'error'>
  /** For the compile line in log.md. */
  appVersion?: string
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
  /** A regeneration: built once the run ID is known (REQUIREMENTS-v3.1 4.3). */
  regen?: (runId: string) => Promise<RegenDeps>
  /** What started it. Defaults from `only` and `regen`. */
  kind?: RunKind
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
  let readyNotified = false

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
    runId: string,
    regen?: RegenDeps
  ): Promise<{ deps: EngineDeps; root: string; model: string }> {
    const { root, model, profile } = await need()
    const company = safeName(profile.company.name)
    // Task documents not yet in wiki format live in app state until they become articles.
    const state = await stateDir(root)
    const drafts = join(state, 'drafts')
    const base = { root: drafts, profile, runId, company, tasks }
    const ctx = makeContext(base)
    const sources = new RunSources(root, join(state, 'runs', `${runId}.sources.json`), isoDay())
    const execute = createExecutor({
      ...base,
      wikiRoot: root,
      sources,
      model,
      provider: d.provider(),
      getKey: d.getKey,
      pricing: d.pricing(),
      readSkill: d.readSkill,
      local: d.local,
      ...(regen ? { regen } : {})
    })
    const deps: EngineDeps = {
      ...d.engine,
      tasks,
      context: () => ctx,
      execute,
      verifyOutput: outputVerifier(drafts, ctx, root),
      // Error messages from our own code and the file system only. Model output never becomes an error message.
      onTaskError: (task, err) =>
        d.log.warn(
          `Task ${task.id} failed: ${err instanceof ProviderError ? err.code : err instanceof Error ? err.message.slice(0, 300) : 'unknown'}`
        ),
      save: (run) => saveRun(root, run),
      emit: (run) => {
        d.send(run)
        if (!readyNotified && run.playbookReadyAt && run.kind !== 'regen') {
          readyNotified = true
          d.onPlaybookReady?.(run)
        }
        if (
          !notified &&
          (run.status === 'done' || run.status === 'failed' || run.status === 'cancelled')
        ) {
          notified = true
          d.log.info(`Research run ${run.id} ${run.status}: spent $${run.spentUsd.toFixed(2)}`)
          void afterRun(root, run, model)
            .then(async () => {
              // A regeneration is ready for review once its run ends (REQUIREMENTS-v3.1 5).
              if (regen)
                await finishRun(root, run.id, {
                  ok: run.status === 'done',
                  costUsd: run.spentUsd
                })
            })
            .finally(() => d.onFinished?.(run))
        }
      }
    }
    return { deps, root, model }
  }

  /**
   * After a run (REQUIREMENTS-v2 3.6, Phase 6.6): indexes regenerated, one compile line in log.md,
   * and the conformance check stored for the Use your wiki view.
   */
  async function afterRun(root: string, run: RunView, model: string): Promise<void> {
    try {
      const prov = await readProvenance(root)
      const articles = Object.entries(prov).filter(
        ([p, e]) => e.runId === run.id && p.startsWith('wiki/')
      ).length
      if (articles)
        await appendLog(
          root,
          'compile',
          `research run ${run.id} (desktop app ${d.appVersion ?? 'dev'}, ${model}) -> ${articles} articles`
        )
      await reciprocateSeeAlso(root)
      await writeIndexes(root)
      const report = await checkWiki(root)
      await writeJsonAtomic(join(await stateDir(root), 'conformance.json'), report)
    } catch (err) {
      d.log.warn(
        `After-run wiki upkeep failed: ${err instanceof Error ? err.message.slice(0, 200) : 'unknown'}`
      )
    }
  }

  /** The latest run from disk, if it was interrupted, comes back paused so the person chooses to resume. */
  async function loadInterrupted(): Promise<void> {
    if (loaded) return
    loaded = true
    const root = d.getRoot()
    if (!root || engine) return
    const saved = await latestRun(root)
    if (!saved || !isUnfinished(saved)) return
    // A regeneration can't resume without its staging setup: it would write to the wiki.
    const job = await readJob(root)
    if (job?.runId === saved.id) {
      await finishRun(root, saved.id, { ok: false, costUsd: saved.spentUsd })
      // Not resumable, so it must not offer "Resume research" either.
      await saveRun(root, { ...saved, status: 'cancelled', pause: null })
      return
    }
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
      readyNotified = !!saved.playbookReadyAt
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
      const kinds: TaskKind[] = tasks
        .filter((t) => !t.onDemand)
        .flatMap((t) =>
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
      const regen = options.regen ? await options.regen(runId) : undefined
      const { deps } = await engineDeps(runId, regen)
      notified = false
      readyNotified = false
      engine = new ResearchEngine(deps, {
        runId,
        model,
        concurrency: Math.min(
          MAX_CONCURRENCY,
          Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY)
        ),
        budgetCapUsd: Math.max(0.01, options.budgetCapUsd ?? DEFAULT_BUDGET_USD),
        skipWeb,
        only: options.only ?? null,
        kind: regen ? 'regen' : (options.kind ?? (options.only ? 'selected' : 'full'))
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
      return this.start({
        only: unique,
        kind: target.preset === 'playbook' ? 'playbook' : 'selected'
      })
    },

    /** Each step's status from disk, across runs (REQUIREMENTS-v4.4 4A.2). Reads only. */
    async taskStates(): Promise<StepState[]> {
      const root = d.getRoot()
      if (!root) throw new ResearchError('no_workspace', 'Choose a workspace folder first.')
      const profile = (await readProfile(root)) ?? emptyProfile()
      const company = safeName(profile.company.name)
      const drafts = join(await stateDir(root), 'drafts')
      const ctx = makeContext({ root: drafts, profile, runId: '', company, tasks })
      const model = d.getModel() ?? ''
      const pricing = d.pricing()
      const competitors = Math.min(5, profile.company.competitors.length || 4)
      return stepStates({
        tasks,
        draftsRoot: drafts,
        wikiRoot: root,
        ctx,
        // The run in memory is newer than its file while saves catch up.
        runs: [
          ...(engine ? [engine.view()] : []),
          ...(await listRuns(root)).filter((r) => r.id !== engine?.runId)
        ],
        verify: outputVerifier(drafts, ctx, root),
        cost: (t) =>
          estimateRun(
            t.fanOut ? (Array(competitors).fill('web-profile') as TaskKind[]) : [t.kind],
            model,
            pricing,
            1
          ).costUsd
      })
    },

    /**
     * Runs the chosen steps (REQUIREMENTS-v4.4 4A.3, 4A.4): added to the run that is going, else a new
     * scoped run. Refuses a step whose dependencies have no output and don't come along, and a done
     * step that writes wiki articles (that goes through Regenerate).
     */
    async runTasks(ids: string[], options: { budgetCapUsd?: number } = {}): Promise<RunView> {
      await loadInterrupted()
      const states = await this.taskStates()
      const byId = new Map(states.map((s) => [s.id, s]))
      const unique = [...new Set(ids)]
      if (!unique.length || unique.some((id) => !byId.has(id)))
        throw new ResearchError('invalid_payload', 'There is nothing to run.')
      const going = engine && !engine.isFinished ? engine : null
      const fresh = unique.filter((id) => !going?.has(id))
      const alongside = new Set([
        ...fresh,
        ...tasks.filter((t) => going?.has(t.id)).map((t) => t.id)
      ])
      for (const id of fresh) {
        const s = byId.get(id)!
        if (s.status === 'done' && !s.rerunnable)
          throw new ResearchError(
            'invalid_payload',
            `${s.title} already has output. Use Regenerate to change it.`
          )
        const missing = missingDeps(s, byId, alongside)
        if (missing.length)
          throw new ResearchError(
            'invalid_payload',
            `${s.title} needs ${missing.map((m) => byId.get(m)?.title ?? m).join(', ')} first.`
          )
      }
      if (going) {
        going.addTasks(fresh)
        return going.view()
      }
      return this.start({ only: fresh, budgetCapUsd: options.budgetCapUsd })
    },

    /** Every output the pipeline writes, for the Wiki pane (missing files show as missing). */
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
      const entries: CatalogEntry[] = tasks
        .filter((t) => !t.onDemand)
        .map((t) => ({
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

    /** "What we've found so far" (REQUIREMENTS-v4.4 4.3), from disk. Reads only. */
    async findings(): Promise<Finding[]> {
      const root = d.getRoot()
      if (!root) throw new ResearchError('no_workspace', 'Choose a workspace folder first.')
      const profile = (await readProfile(root)) ?? emptyProfile()
      return buildFindings({
        wikiRoot: root,
        draftsRoot: join(await stateDir(root), 'drafts'),
        company: profile.company.name,
        website: profile.company.website
      })
    },

    /** The done screen was seen, or the playbook it led to was opened (REQUIREMENTS-v4.4 3.1). */
    async markDoneSeen(runId: string): Promise<void> {
      if (engine?.runId === runId) return engine.markDoneSeen()
      const root = d.getRoot()
      const run = root ? await loadRun(root, runId) : null
      if (root && run && !run.doneSeenAt) await saveRun(root, { ...run, doneSeenAt: Date.now() })
    },

    /** What the done screen shows (REQUIREMENTS-v4.4 3.3). Reads only. */
    async doneStats(runId: string): Promise<DoneStats | null> {
      const root = d.getRoot()
      if (!root) throw new ResearchError('no_workspace', 'Choose a workspace folder first.')
      const run = engine?.runId === runId ? engine.view() : await loadRun(root, runId)
      if (!run) return null
      return buildDoneStats(root, run, (await readProfile(root))?.company.name ?? '')
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

    /** What a Regenerate preview needs to estimate (REQUIREMENTS-v3.1 4.1). */
    planDeps(): PlanDeps {
      const model = d.getModel() ?? ''
      const pricing = d.pricing()
      return {
        tasks,
        model,
        budgetCapUsd: DEFAULT_BUDGET_USD,
        estimate: (kinds) => {
          const e = estimateRun(kinds, model, pricing, 1)
          return { costUsd: e.costUsd, minutes: e.minutes }
        }
      }
    },

    /** True while a run is going or paused (resumable) in this workspace. */
    isActive(): boolean {
      return !!engine && !engine.isFinished
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
