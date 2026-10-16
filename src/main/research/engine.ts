import { ERROR_COPY, errorMessage, type ErrorCode } from '@shared/errors'
import type { PauseReason, RunStatus, RunView, TaskStatus, TaskView } from '@shared/research'
import { ProviderError, TaskAbortedError } from '../providers/types'
import { findIsolationViolations } from './isolation'
import type { TaskContext, TaskDef, TaskOutcome } from './types'

/** Retries for rate limit, overload and network errors (REQUIREMENTS-v1 3.5). */
export const MAX_RETRIES = 3
const BACKOFF_BASE_MS = 2000
const BACKOFF_MAX_MS = 30_000
const RATE_LIMIT_MIN_WAIT_MS = 5000
/** Several 429s at once count as one reason to slow down. */
const HALVE_COOLDOWN_MS = 2000

/** Errors that stop the whole run. The task goes back in the queue. */
const RUN_LEVEL: Partial<Record<ErrorCode, PauseReason>> = {
  invalid_key: 'invalid_key',
  no_credit: 'no_credit',
  spend_limit_reached: 'spend_limit_reached',
  web_search_disabled: 'web_search_disabled'
}

export interface EngineDeps {
  tasks: TaskDef[]
  /** Context for group tasks, so they can read what their dependencies wrote. */
  context(runId: string): TaskContext
  /** Runs one task. Throws ProviderError, TaskAbortedError or any other error. */
  execute(task: TaskDef, signal: AbortSignal): Promise<TaskOutcome>
  /** On resume: is this finished task's output still on disk and complete? */
  verifyOutput?(task: TaskDef): Promise<boolean>
  /** Called after every change, in order. */
  save(run: RunView): Promise<void> | void
  emit(run: RunView): void
  now?(): number
  /** Resolves after `ms`, or early when the signal aborts. */
  sleep?(ms: number, signal: AbortSignal): Promise<void>
  random?(): number
}

export interface EngineOptions {
  runId: string
  model: string
  concurrency: number
  budgetCapUsd: number
  skipWeb?: boolean
  /** Local tasks (crawl, extract) run outside the AI limit. */
  localConcurrency?: number
}

interface Rt {
  def: TaskDef
  parent: string | null
  status: TaskStatus
  attempts: number
  startedAt: number | null
  endedAt: number | null
  costUsd: number
  error: { code: ErrorCode; message: string } | null
  note: string | null
  output: string | null
  /** Set when this task was skipped because the user cancelled, so a resume runs it again. */
  cancelled: boolean
  controller: AbortController | null
}

type AbortWhy = 'cancel' | 'pause'

const defaultSleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const t = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        resolve()
      },
      { once: true }
    )
  })

const money = (n: number): string => `$${n.toFixed(2)}`

export class ResearchEngine {
  private rts = new Map<string, Rt>()
  private order: string[] = []
  private status: RunStatus = 'running'
  private pauseInfo: { reason: PauseReason; message: string } | null = null
  private spentUsd = 0
  private concurrency: number
  private cap: number
  private skipWeb: boolean
  private startedAt: number
  private endedAt: number | null = null
  private cooldownUntil = 0
  private lastHalvedAt = -Infinity
  private aiRunning = 0
  private localRunning = 0
  private expanding = new Set<string>()
  private saveChain: Promise<void> = Promise.resolve()
  private abortWhy = new Map<string, AbortWhy>()
  private wakeTimer: AbortController | null = null

  private readonly now: () => number
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>
  private readonly random: () => number
  private readonly localLimit: number

  constructor(
    private readonly deps: EngineDeps,
    private readonly opts: EngineOptions
  ) {
    this.now = deps.now ?? Date.now
    this.sleep = deps.sleep ?? defaultSleep
    this.random = deps.random ?? Math.random
    this.concurrency = Math.max(1, opts.concurrency)
    this.cap = opts.budgetCapUsd
    this.skipWeb = opts.skipWeb ?? false
    this.localLimit = opts.localConcurrency ?? 2
    this.startedAt = this.now()
    for (const def of deps.tasks) this.add(def, null)
  }

  // ---------------------------------------------------------------- public API

  get runId(): string {
    return this.opts.runId
  }

  /** Begins the run. Throws if the task graph breaks the isolation rule. */
  start(): void {
    const problems = findIsolationViolations(this.deps.tasks)
    if (problems.length) throw new Error(`Isolation rule broken: ${problems.join('; ')}`)
    if (this.skipWeb) this.skipWebTasks('Skipped: web search unavailable')
    this.changed()
    this.pump()
  }

  view(): RunView {
    const tasks: TaskView[] = this.order.map((id) => {
      const t = this.rts.get(id)!
      return {
        id,
        title: t.def.title,
        stage: t.def.stage,
        status: t.status,
        parent: t.parent,
        local: !!t.def.local || !!t.def.fanOut,
        web: t.def.web !== false,
        attempts: t.attempts,
        startedAt: t.startedAt,
        endedAt: t.endedAt,
        costUsd: t.costUsd,
        error: t.error,
        note: t.note,
        output: t.output
      }
    })
    return {
      id: this.opts.runId,
      status: this.status,
      pause: this.pauseInfo,
      model: this.opts.model,
      concurrency: this.concurrency,
      budgetCapUsd: this.cap,
      spentUsd: this.spentUsd,
      skipWeb: this.skipWeb,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      tasks
    }
  }

  /** User pause: no new tasks start. Tasks already running finish. */
  pause(): void {
    if (this.status !== 'running') return
    this.pauseRun('user', 'Research is paused.', false)
  }

  /** The app is quitting: abort running tasks so they go back in the queue, and leave the run resumable. */
  interrupt(): void {
    if (this.status !== 'running') return
    this.pauseRun('user', 'Research was interrupted. Resume to continue.', true)
  }

  /**
   * Continue a paused run. After a "web search is off" pause, `skipWeb` skips the web tasks instead of retrying them.
   * After a budget pause, `budgetCapUsd` raises the cap.
   */
  resume(options: { skipWeb?: boolean; budgetCapUsd?: number } = {}): void {
    if (this.status !== 'paused') return
    if (options.budgetCapUsd !== undefined) this.cap = options.budgetCapUsd
    if (options.skipWeb) {
      this.skipWeb = true
      this.skipWebTasks('Skipped: web search unavailable')
    }
    this.status = 'running'
    this.pauseInfo = null
    this.changed()
    this.pump()
  }

  setBudget(capUsd: number): void {
    this.cap = capUsd
    this.changed()
  }

  /** Stop. Running tasks are aborted, everything unfinished is skipped, finished outputs are kept. */
  cancel(): void {
    if (this.status === 'cancelled' || this.status === 'done') return
    this.status = 'cancelled'
    this.pauseInfo = null
    this.endedAt = this.now()
    this.wakeTimer?.abort()
    for (const t of this.rts.values()) {
      if (t.status === 'running' && t.controller) {
        this.abortWhy.set(t.def.id, 'cancel')
        t.controller.abort()
      } else if (t.status === 'waiting' || t.status === 'blocked') {
        this.skip(t, 'Skipped: research was stopped', true)
      } else if (t.status === 'running') {
        // a group waiting on its children
        this.skip(t, 'Skipped: research was stopped', true)
      }
    }
    this.changed()
  }

  /** Run a failed, blocked or skipped task again, along with anything it blocked. */
  retryTask(id: string): void {
    const t = this.rts.get(id)
    if (!t || this.status === 'cancelled') return
    if (t.def.fanOut) {
      for (const c of this.childrenOf(id)) if (c.status !== 'done') this.reopen(c)
      if (t.status !== 'done') this.reopen(t)
    } else if (t.status === 'failed' || t.status === 'blocked' || t.status === 'skipped') {
      if (t.def.web !== false && t.status === 'skipped') this.skipWeb = false
      this.reopen(t)
    } else return
    this.unblockDependents()
    if (this.status === 'done' || this.status === 'failed') {
      this.status = 'running'
      this.endedAt = null
    }
    this.changed()
    this.pump()
  }

  /** Restore an interrupted run. It comes back paused so the user chooses to resume. */
  static async restore(
    deps: EngineDeps,
    opts: EngineOptions,
    saved: RunView
  ): Promise<ResearchEngine> {
    const engine = new ResearchEngine(deps, {
      ...opts,
      runId: saved.id,
      concurrency: saved.concurrency,
      budgetCapUsd: saved.budgetCapUsd,
      skipWeb: saved.skipWeb
    })
    engine.spentUsd = saved.spentUsd
    engine.startedAt = saved.startedAt
    const byId = new Map(saved.tasks.map((t) => [t.id, t]))

    // Children of group tasks are made again from what the group's dependencies wrote.
    for (const group of engine.rts.values()) {
      if (!group.def.fanOut) continue
      const saw = byId.get(group.def.id)
      const hadChildren = saved.tasks.some((t) => t.parent === group.def.id)
      if (!saw || (!hadChildren && saw.status !== 'done')) continue
      try {
        for (const child of await group.def.fanOut(deps.context(saved.id)))
          engine.addChild(child, group.def.id)
      } catch {
        // the inputs are gone; the group expands again when it runs
      }
    }

    for (const [id, rt] of engine.rts) {
      const s = byId.get(id)
      if (!s || rt.def.fanOut) continue
      rt.attempts = 0
      rt.costUsd = s.costUsd
      rt.startedAt = s.startedAt
      rt.output = s.output
      if (s.status === 'done' && (await (deps.verifyOutput?.(rt.def) ?? true))) {
        rt.status = 'done'
        rt.endedAt = s.endedAt
        rt.note = s.note
      } else if (s.status === 'skipped' && !s.note?.includes('stopped')) {
        rt.status = 'skipped'
        rt.note = s.note
        rt.endedAt = s.endedAt
      } else {
        rt.status = 'waiting'
        rt.startedAt = null
        rt.output = s.status === 'done' ? null : s.output
      }
    }
    for (const g of engine.rts.values()) {
      if (g.def.fanOut && engine.childrenOf(g.def.id).length) g.status = 'running'
    }
    engine.settleGroups()
    engine.status = 'paused'
    engine.pauseInfo = { reason: 'user', message: 'Research was interrupted. Resume to continue.' }
    engine.endedAt = null
    engine.changed()
    return engine
  }

  // ---------------------------------------------------------------- building

  private add(def: TaskDef, parent: string | null): void {
    this.rts.set(def.id, {
      def,
      parent,
      status: 'waiting',
      attempts: 0,
      startedAt: null,
      endedAt: null,
      costUsd: 0,
      error: null,
      note: null,
      output: null,
      cancelled: false,
      controller: null
    })
    this.order.push(def.id)
  }

  private addChild(def: TaskDef, parent: string): void {
    if (this.rts.has(def.id)) return
    this.add(def, parent)
    // keep children right after their group in the list
    this.order.pop()
    const siblings = this.order.filter((id) => this.rts.get(id)?.parent === parent)
    const anchor = siblings.length ? siblings[siblings.length - 1] : parent
    this.order.splice(this.order.indexOf(anchor) + 1, 0, def.id)
  }

  private childrenOf(id: string): Rt[] {
    return [...this.rts.values()].filter((t) => t.parent === id)
  }

  // ---------------------------------------------------------------- scheduling

  private depsSatisfied(t: Rt): boolean {
    return t.def.dependsOn.every((d) => {
      const s = this.rts.get(d)?.status
      return s === 'done' || s === 'skipped'
    })
  }

  private blockedByFailure(t: Rt): boolean {
    return t.def.dependsOn.some((d) => {
      const s = this.rts.get(d)?.status
      return s === 'failed' || s === 'blocked'
    })
  }

  private pump(): void {
    if (this.status !== 'running') return
    // Settle groups and block dependents of failed tasks until nothing changes.
    // (A group failing can block tasks, and a blocked child can fail its group.)
    for (let moved = true; moved;) {
      const before = this.signature()
      this.settleGroups()
      this.unblockDependents()
      for (const t of this.rts.values()) {
        if (t.status === 'waiting' && this.blockedByFailure(t)) {
          t.status = 'blocked'
          t.endedAt = this.now()
        }
      }
      moved = this.signature() !== before
    }

    const ready = [...this.rts.values()]
      .filter((t) => t.status === 'waiting' && this.depsSatisfied(t))
      .sort(
        (a, b) =>
          a.def.stage - b.def.stage || this.order.indexOf(a.def.id) - this.order.indexOf(b.def.id)
      )

    for (const t of ready) {
      if (this.status !== 'running') break
      if (t.def.fanOut) {
        void this.expand(t)
      } else if (t.def.local) {
        if (this.localRunning < this.localLimit) void this.runTask(t, true)
      } else {
        if (this.skipWeb && t.def.web !== false) {
          this.skip(t, 'Skipped: web search unavailable')
          continue
        }
        if (this.aiRunning >= this.concurrency) continue
        if (this.now() < this.cooldownUntil) {
          this.wakeAt(this.cooldownUntil)
          continue
        }
        if (this.spentUsd >= this.cap) {
          this.pauseRun(
            'budget',
            `Research has used ${money(this.spentUsd)} of your ${money(this.cap)} budget.`,
            false
          )
          break
        }
        void this.runTask(t, false)
      }
    }

    this.settleGroups()
    this.finishIfDone()
    this.changed()
  }

  private signature(): string {
    return [...this.rts.values()].map((t) => t.status[0]).join('')
  }

  private wakeAt(time: number): void {
    this.wakeTimer?.abort()
    const ctl = new AbortController()
    this.wakeTimer = ctl
    void this.sleep(Math.max(0, time - this.now()), ctl.signal).then(() => {
      if (!ctl.signal.aborted) this.pump()
    })
  }

  private finishIfDone(): void {
    if (this.status !== 'running') return
    const open = [...this.rts.values()].some(
      (t) => t.status === 'waiting' || t.status === 'running'
    )
    if (open) return
    const failed = [...this.rts.values()].some(
      (t) => t.status === 'failed' || t.status === 'blocked'
    )
    this.status = failed ? 'failed' : 'done'
    this.endedAt = this.now()
  }

  private skip(t: Rt, note: string, cancelled = false): void {
    t.status = 'skipped'
    t.note = note
    t.cancelled = cancelled
    t.endedAt = this.now()
  }

  private skipWebTasks(note: string): void {
    for (const t of this.rts.values())
      if (t.status === 'waiting' && t.def.web !== false) this.skip(t, note)
  }

  private reopen(t: Rt): void {
    t.status = 'waiting'
    t.error = null
    t.note = null
    t.attempts = 0
    t.endedAt = null
    t.cancelled = false
  }

  /** Tasks blocked only because something they needed failed go back to waiting once it is waiting again. */
  private unblockDependents(): void {
    let moved = true
    while (moved) {
      moved = false
      for (const t of this.rts.values()) {
        if (t.status === 'blocked' && !this.blockedByFailure(t)) {
          this.reopen(t)
          moved = true
        }
      }
    }
  }

  private pauseRun(reason: PauseReason, message: string, abortInflight: boolean): void {
    if (this.status !== 'running') return
    this.status = 'paused'
    this.pauseInfo = { reason, message }
    if (abortInflight) {
      for (const t of this.rts.values()) {
        if (t.status === 'running' && t.controller) {
          this.abortWhy.set(t.def.id, 'pause')
          t.controller.abort()
        }
      }
    }
    this.changed()
  }

  // ---------------------------------------------------------------- groups

  private async expand(t: Rt): Promise<void> {
    if (this.expanding.has(t.def.id)) return
    this.expanding.add(t.def.id)
    t.status = 'running'
    t.startedAt = this.now()
    this.changed()
    try {
      const children = await t.def.fanOut!(this.deps.context(this.opts.runId))
      for (const c of children) this.addChild(c, t.def.id)
      if (children.length === 0) t.note = 'Nothing to do'
    } catch {
      t.status = 'failed'
      t.error = { code: 'internal', message: 'Could not work out what to run next.' }
      t.endedAt = this.now()
    } finally {
      this.expanding.delete(t.def.id)
      this.pump()
    }
  }

  /** A group is done when its children are. It fails only if none of them succeeded. */
  private settleGroups(): void {
    for (const g of this.rts.values()) {
      if (!g.def.fanOut || this.expanding.has(g.def.id)) continue
      if (g.status !== 'running' && g.status !== 'done' && g.status !== 'failed') continue
      const kids = this.childrenOf(g.def.id)
      // A group that failed to expand has no children and is left alone.
      if (g.status === 'failed' && kids.length === 0) continue
      const open = kids.some((k) => k.status === 'waiting' || k.status === 'running')
      if (open) {
        g.status = 'running'
        g.endedAt = null
        continue
      }
      if (g.status === 'done' && kids.length) continue
      const anyDone = kids.some((k) => k.status === 'done')
      const allSkipped = kids.length > 0 && kids.every((k) => k.status === 'skipped')
      g.status = kids.length === 0 || anyDone ? 'done' : allSkipped ? 'skipped' : 'failed'
      g.endedAt = this.now()
      g.error = null
      if (g.status === 'failed')
        g.error = { code: 'internal', message: 'None of the competitor profiles could be written.' }
      if (g.status === 'done' && kids.some((k) => k.status === 'failed' || k.status === 'blocked'))
        g.note = 'Some profiles failed'
    }
  }

  // ---------------------------------------------------------------- running one task

  private async runTask(t: Rt, local: boolean): Promise<void> {
    t.status = 'running'
    t.startedAt ??= this.now()
    t.endedAt = null
    t.note = null
    t.error = null
    const controller = new AbortController()
    t.controller = controller
    if (local) this.localRunning++
    else this.aiRunning++
    this.changed()

    const stopped = (): void => {
      const why = this.abortWhy.get(t.def.id)
      if (why === 'pause') {
        // Not a real attempt: it goes back in the queue for the resume.
        t.attempts = Math.max(0, t.attempts - 1)
        t.status = 'waiting'
        t.startedAt = null
      } else this.skip(t, 'Skipped: research was stopped', true)
    }

    try {
      for (;;) {
        t.attempts++
        try {
          const outcome = await this.deps.execute(t.def, controller.signal)
          t.costUsd += outcome.costUsd
          this.spentUsd += outcome.costUsd
          t.output = outcome.output
          t.note = outcome.note ?? null
          t.status = 'done'
          t.endedAt = this.now()
          return
        } catch (err) {
          const verdict = this.classify(t, err, controller.signal)
          if (verdict.kind === 'retry') {
            t.note = verdict.note
            this.changed()
            await this.sleep(verdict.waitMs, controller.signal)
            if (controller.signal.aborted) return stopped()
            t.note = null
            continue
          }
          if (verdict.kind === 'stopped') return stopped()
          if (verdict.kind === 'run-level') {
            t.attempts = Math.max(0, t.attempts - 1)
            t.status = 'waiting'
            t.startedAt = null
            this.pauseRun(verdict.reason, verdict.message, true)
            return
          }
          t.status = 'failed'
          t.error = verdict.error
          t.endedAt = this.now()
          return
        }
      }
    } finally {
      this.abortWhy.delete(t.def.id)
      t.controller = null
      if (local) this.localRunning--
      else this.aiRunning--
      this.pump()
      // pump does nothing while paused or stopped, but the final state of this task still has to be shown and saved.
      this.changed()
    }
  }

  private classify(
    t: Rt,
    err: unknown,
    signal: AbortSignal
  ):
    | { kind: 'retry'; waitMs: number; note: string }
    | { kind: 'stopped' }
    | { kind: 'run-level'; reason: PauseReason; message: string }
    | { kind: 'fail'; error: { code: ErrorCode; message: string } } {
    if (err instanceof TaskAbortedError || signal.aborted) return { kind: 'stopped' }

    if (err instanceof ProviderError) {
      const level = RUN_LEVEL[err.code]
      if (level) return { kind: 'run-level', reason: level, message: ERROR_COPY[err.code] }

      const retryable =
        err.code === 'rate_limited' || err.code === 'overloaded' || err.code === 'network'
      if (retryable && t.attempts <= MAX_RETRIES) {
        let waitMs = Math.min(BACKOFF_BASE_MS * 2 ** (t.attempts - 1), BACKOFF_MAX_MS)
        waitMs += Math.floor(waitMs * 0.25 * this.random())
        if (err.code === 'rate_limited') {
          if (err.retryAfterSeconds !== undefined) waitMs = err.retryAfterSeconds * 1000
          waitMs = Math.max(waitMs, RATE_LIMIT_MIN_WAIT_MS)
          this.slowDown(waitMs)
        }
        const seconds = Math.ceil(waitMs / 1000)
        return {
          kind: 'retry',
          waitMs,
          note:
            err.code === 'rate_limited'
              ? `Waiting ${seconds}s for the rate limit`
              : `Trying again in ${seconds}s`
        }
      }
      return {
        kind: 'fail',
        error: { code: err.code, message: errorMessage(err.code, err.detail) }
      }
    }
    // Local tasks raise our own messages (never file content). AI tasks get a generic one.
    const message =
      t.def.local && err instanceof Error ? err.message.slice(0, 200) : errorMessage('internal')
    return { kind: 'fail', error: { code: 'internal', message } }
  }

  /** A rate limit: wait out the retry-after for everyone, and halve concurrency for the rest of the run. */
  private slowDown(waitMs: number): void {
    const now = this.now()
    this.cooldownUntil = Math.max(this.cooldownUntil, now + waitMs)
    if (now - this.lastHalvedAt >= HALVE_COOLDOWN_MS) {
      this.lastHalvedAt = now
      this.concurrency = Math.max(1, Math.floor(this.concurrency / 2))
    }
  }

  // ---------------------------------------------------------------- persistence and events

  private changed(): void {
    const view = this.view()
    this.deps.emit(view)
    this.saveChain = this.saveChain.then(() => this.deps.save(view)).catch(() => undefined)
  }

  /** Resolves when everything queued so far has been saved. */
  flush(): Promise<void> {
    return this.saveChain
  }

  get isFinished(): boolean {
    return this.status === 'done' || this.status === 'failed' || this.status === 'cancelled'
  }
}
