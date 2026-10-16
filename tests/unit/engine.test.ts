import { describe, expect, it } from 'vitest'
import {
  MAX_RETRIES,
  ResearchEngine,
  type EngineDeps,
  type EngineOptions
} from '../../src/main/research/engine'
import type { TaskContext, TaskDef, TaskOutcome } from '../../src/main/research/types'
import { ProviderError, TaskAbortedError } from '../../src/main/providers/types'
import type { RunView } from '../../src/shared/research'
import { emptyProfile } from '../../src/shared/profile'

// ---------------------------------------------------------------- helpers

const ai = (id: string, dependsOn: string[] = [], extra: Partial<TaskDef> = {}): TaskDef => ({
  id,
  title: id,
  stage: 1,
  kind: 'synthesis',
  dependsOn,
  skill: 's',
  instruction: 'x',
  web: false,
  output: () => `${id}.md`,
  ...extra
})
const web = (id: string, dependsOn: string[] = []): TaskDef =>
  ai(id, dependsOn, { kind: 'web-research', web: { search: { maxUses: 1 } } })
const local = (id: string, dependsOn: string[] = []): TaskDef => ({
  id,
  title: id,
  stage: 1,
  kind: 'local',
  dependsOn,
  local: 'crawl',
  web: false,
  output: () => `${id}.md`
})

type Exec = (
  task: TaskDef,
  signal: AbortSignal,
  calls: number
) => Promise<Partial<TaskOutcome> | void>

function setup(
  tasks: TaskDef[],
  exec: Exec,
  opts: Partial<EngineOptions> = {},
  over: Partial<EngineDeps> = {}
) {
  let clock = 1_000_000
  const sleeps: number[] = []
  const saved: RunView[] = []
  const emitted: RunView[] = []
  const calls = new Map<string, number>()
  const started: string[] = []
  let running = 0
  let peak = 0
  const ctx: TaskContext = {
    profile: emptyProfile(),
    runId: 'run1',
    company: 'Acme',
    readOutput: async () => null
  }
  const deps: EngineDeps = {
    tasks,
    context: () => ctx,
    execute: async (task, signal) => {
      started.push(task.id)
      const n = (calls.get(task.id) ?? 0) + 1
      calls.set(task.id, n)
      running++
      peak = Math.max(peak, running)
      try {
        const r = (await exec(task, signal, n)) ?? {}
        return { costUsd: 0, output: task.output(ctx), ...r }
      } finally {
        running--
      }
    },
    save: (v) => void saved.push(v),
    emit: (v) => void emitted.push(v),
    now: () => clock,
    sleep: async (ms, signal) => {
      sleeps.push(ms)
      if (!signal.aborted) clock += ms
    },
    random: () => 0,
    ...over
  }
  const options: EngineOptions = {
    runId: 'run1',
    model: 'claude-sonnet-5-5',
    concurrency: 3,
    budgetCapUsd: 5,
    ...opts
  }
  const engine = new ResearchEngine(deps, options)
  const status = (id: string) => engine.view().tasks.find((t) => t.id === id)?.status
  const statuses = () => Object.fromEntries(engine.view().tasks.map((t) => [t.id, t.status]))
  const until = async (cond: () => boolean, label = 'condition') => {
    for (let i = 0; i < 400; i++) {
      if (cond()) return
      await new Promise((r) => setImmediate(r))
    }
    throw new Error(
      `timed out waiting for ${label}: ${JSON.stringify(statuses())} run=${engine.view().status}`
    )
  }
  const finished = () => until(() => engine.isFinished, 'run to finish')
  return {
    engine,
    sleeps,
    saved,
    emitted,
    calls,
    started,
    peak: () => peak,
    status,
    statuses,
    until,
    finished,
    advance: (ms: number) => (clock += ms),
    ctx,
    deps,
    options
  }
}

/** A task body that waits until released, so tests can see what runs at the same time. */
function gates() {
  const open = new Map<string, () => void>()
  const waiting = new Map<string, Promise<void>>()
  const wait = (id: string, signal: AbortSignal) => {
    if (!waiting.has(id)) {
      waiting.set(
        id,
        new Promise<void>((resolve, reject) => {
          open.set(id, resolve)
          signal.addEventListener('abort', () => reject(new TaskAbortedError()), { once: true })
        })
      )
    }
    return waiting.get(id)!
  }
  return {
    wait,
    release: (id: string) => open.get(id)?.(),
    reset: (id: string) => (waiting.delete(id), open.delete(id))
  }
}

const perr = (code: ConstructorParameters<typeof ProviderError>[0], retryAfter?: number) =>
  new ProviderError(code, undefined, retryAfter)

// ---------------------------------------------------------------- tests

describe('scheduling', () => {
  it('runs tasks in dependency order and finishes done', async () => {
    const h = setup([ai('a'), ai('b', ['a']), ai('c', ['b'])], async () => undefined)
    h.engine.start()
    await h.finished()
    expect(h.started).toEqual(['a', 'b', 'c'])
    expect(h.engine.view().status).toBe('done')
  })

  it('starts independent tasks together, up to the AI concurrency, and local tasks outside that limit', async () => {
    const g = gates()
    const tasks = [...'abcdef'].map((x) => ai(x)).concat([local('l1'), local('l2'), local('l3')])
    const h = setup(tasks, (t, s) => g.wait(t.id, s))
    h.engine.start()
    await h.until(() => h.started.length === 5, 'first wave')
    // 3 AI tasks and 2 local tasks run at once, none finished yet
    expect(new Set(h.started)).toEqual(new Set(['a', 'b', 'c', 'l1', 'l2']))
    expect(h.engine.view().tasks.filter((t) => t.status === 'running')).toHaveLength(5)
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'l1', 'l2', 'l3']) {
      await new Promise((r) => setImmediate(r))
      g.release(id)
    }
    await h.finished()
    expect(h.engine.view().status).toBe('done')
    expect(h.peak()).toBeLessThanOrEqual(5)
  })

  it('orders ready tasks by stage', async () => {
    const g = gates()
    const tasks = [
      ai('late', [], { stage: 3 }),
      ai('early', [], { stage: 1 }),
      ai('mid', [], { stage: 2 })
    ]
    const h = setup(tasks, (t, s) => g.wait(t.id, s), { concurrency: 1 })
    h.engine.start()
    await h.until(() => h.started.length === 1)
    expect(h.started).toEqual(['early'])
    g.release('early')
    await h.until(() => h.started.length === 2)
    expect(h.started[1]).toBe('mid')
    g.release('mid')
    await h.until(() => h.started.length === 3)
    g.release('late')
    await h.finished()
  })

  it('refuses to start if the task graph breaks the isolation rule', () => {
    const bad = [
      ai('extract', [], { local: 'extract' }),
      ai('w', [], {
        web: { search: { maxUses: 1 } },
        inputs: { outputs: [], optionalOutputs: ['extract'], inputCategories: [] }
      })
    ]
    expect(() => setup(bad, async () => undefined).engine.start()).toThrow(/Isolation rule broken/)
  })
})

describe('failure isolation', () => {
  it('blocks only the dependents of a failed task, finishes everything else, and can retry the failed one', async () => {
    const h = setup(
      [ai('a'), ai('b', ['a']), ai('c', ['b']), ai('x'), ai('y', ['x'])],
      async (t, _s, n) => {
        if (t.id === 'a' && n === 1) throw new Error('boom')
      }
    )
    h.engine.start()
    await h.finished()
    expect(h.statuses()).toEqual({ a: 'failed', b: 'blocked', c: 'blocked', x: 'done', y: 'done' })
    expect(h.engine.view().status).toBe('failed')
    expect(h.engine.view().tasks[0].error?.code).toBe('internal')

    h.engine.retryTask('a')
    expect(h.engine.view().status).toBe('running')
    await h.finished()
    expect(h.statuses()).toEqual({ a: 'done', b: 'done', c: 'done', x: 'done', y: 'done' })
    expect(h.engine.view().status).toBe('done')
  })

  it('does not put a model error message that could hold content on screen', async () => {
    const h = setup([ai('a')], async () => {
      throw new Error('SECRET FILE CONTENT sk-ant-123')
    })
    h.engine.start()
    await h.finished()
    expect(JSON.stringify(h.engine.view())).not.toContain('SECRET')
  })

  it("shows a local task's own error message", async () => {
    const h = setup([local('l')], async () => {
      throw new Error('Could not reach the website')
    })
    h.engine.start()
    await h.finished()
    expect(h.engine.view().tasks[0].error?.message).toBe('Could not reach the website')
  })
})

describe('retries and rate limits', () => {
  it('retries overloaded and network errors with exponential backoff, then succeeds', async () => {
    const h = setup([ai('a')], async (_t, _s, n) => {
      if (n === 1) throw perr('overloaded')
      if (n === 2) throw perr('network')
    })
    h.engine.start()
    await h.finished()
    expect(h.calls.get('a')).toBe(3)
    expect(h.sleeps).toEqual([2000, 4000])
    expect(h.engine.view().status).toBe('done')
  })

  it('gives up after three retries and fails the task with the error', async () => {
    const h = setup([ai('a'), ai('b', ['a'])], async () => {
      throw perr('overloaded')
    })
    h.engine.start()
    await h.finished()
    expect(h.calls.get('a')).toBe(MAX_RETRIES + 1)
    expect(h.sleeps).toEqual([2000, 4000, 8000])
    expect(h.statuses()).toEqual({ a: 'failed', b: 'blocked' })
    expect(h.engine.view().tasks[0].error?.code).toBe('overloaded')
  })

  it('does not retry an error that retrying cannot fix', async () => {
    const h = setup([ai('a')], async () => {
      throw perr('unknown')
    })
    h.engine.start()
    await h.finished()
    expect(h.calls.get('a')).toBe(1)
    expect(h.sleeps).toEqual([])
  })

  it('waits for retry-after on a 429 and halves concurrency for the rest of the run', async () => {
    const tasks = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ai(id))
    const h = setup(tasks, async (_t, _s, n) => {
      if (n === 1) throw perr('rate_limited', 30)
    })
    h.engine.start()
    await h.finished()
    // All three first-wave tasks were limited. They waited the full 30s and the run slowed to 1 at a time (3 -> 1, once).
    expect(h.sleeps.filter((s) => s === 30_000).length).toBeGreaterThanOrEqual(3)
    expect(h.engine.view().concurrency).toBe(1)
    expect(h.engine.view().status).toBe('done')
    expect(h.engine.view().tasks.every((t) => t.status === 'done')).toBe(true)
  })

  it('uses at least 5 seconds when a 429 has no retry-after', async () => {
    const h = setup([ai('a')], async (_t, _s, n) => {
      if (n === 1) throw perr('rate_limited')
    })
    h.engine.start()
    await h.finished()
    expect(h.sleeps[0]).toBeGreaterThanOrEqual(5000)
  })

  it('holds back new tasks during a rate-limit cooldown', async () => {
    const order: string[] = []
    const h = setup([ai('a'), ai('b', ['a'])], async (t, _s, n) => {
      order.push(`${t.id}${n}`)
      if (t.id === 'a' && n === 1) throw perr('rate_limited', 20)
    })
    h.engine.start()
    await h.finished()
    expect(order).toEqual(['a1', 'a2', 'b1'])
    expect(h.engine.view().concurrency).toBe(1)
  })

  it('never lets concurrency drop below one', async () => {
    const h = setup(
      [ai('a')],
      async (_t, _s, n) => {
        if (n <= 3) throw perr('rate_limited', 5)
      },
      { concurrency: 1 }
    )
    h.engine.start()
    await h.finished()
    expect(h.engine.view().concurrency).toBe(1)
    expect(h.engine.view().status).toBe('done')
  })
})

describe('run-level errors', () => {
  it.each(['invalid_key', 'no_credit', 'spend_limit_reached'] as const)(
    '%s pauses the whole run, requeues the task, and resumes',
    async (code) => {
      const g = gates()
      const h = setup([ai('a'), ai('b'), ai('c', ['a'])], async (t, s, n) => {
        if (t.id === 'a' && n === 1) throw perr(code)
        if (t.id === 'b' && n === 1) await g.wait('b', s)
      })
      h.engine.start()
      await h.until(() => h.engine.view().status === 'paused', 'pause')
      const v = h.engine.view()
      expect(v.pause?.reason).toBe(code)
      expect(v.pause?.message.length).toBeGreaterThan(10)
      // The failing task and the in-flight one were put back, not failed.
      await h.until(() => h.status('b') === 'waiting' && h.status('a') === 'waiting', 'requeue')
      expect(h.statuses().c).toBe('waiting')
      expect(h.engine.view().tasks.find((t) => t.id === 'a')!.attempts).toBe(0)

      h.engine.resume()
      await h.finished()
      expect(h.engine.view().status).toBe('done')
      expect(h.engine.view().pause).toBeNull()
    }
  )

  it('web search disabled: pause, then resume with skipWeb skips web tasks and still finishes the rest', async () => {
    const h = setup([web('w1'), web('w2'), ai('s', ['w1', 'w2']), ai('own')], async (t) => {
      if (t.web) throw perr('web_search_disabled')
    })
    h.engine.start()
    await h.until(() => h.engine.view().status === 'paused', 'pause')
    expect(h.engine.view().pause?.reason).toBe('web_search_disabled')
    expect(h.engine.view().skipWeb).toBe(false)

    h.engine.resume({ skipWeb: true })
    await h.finished()
    const v = h.engine.view()
    expect(h.statuses()).toEqual({ w1: 'skipped', w2: 'skipped', s: 'done', own: 'done' })
    expect(v.tasks[0].note).toBe('Skipped: web search unavailable')
    expect(v.skipWeb).toBe(true)
    expect(v.status).toBe('done')
  })

  it('starting with skipWeb skips web tasks up front and runs dependents on what is left', async () => {
    const h = setup([web('w'), ai('s', ['w'])], async () => undefined, { skipWeb: true })
    h.engine.start()
    await h.finished()
    expect(h.calls.has('w')).toBe(false)
    expect(h.statuses()).toEqual({ w: 'skipped', s: 'done' })
  })

  it('retrying a task skipped for web search turns web back on', async () => {
    const h = setup([web('w')], async () => undefined, { skipWeb: true })
    h.engine.start()
    await h.finished()
    h.engine.retryTask('w')
    await h.finished()
    expect(h.statuses().w).toBe('done')
    expect(h.engine.view().skipWeb).toBe(false)
  })
})

describe('budget', () => {
  it('pauses before starting the next AI task once the cap is reached, and continues with a higher cap', async () => {
    const h = setup(
      [ai('a'), ai('b', ['a']), ai('c', ['b']), ai('d', ['c'])],
      async () => ({ costUsd: 2 }),
      { budgetCapUsd: 5 }
    )
    h.engine.start()
    await h.until(() => h.engine.view().status === 'paused', 'budget pause')
    const v = h.engine.view()
    expect(v.pause?.reason).toBe('budget')
    expect(v.pause?.message).toBe('Research has used $6.00 of your $5.00 budget.')
    expect(v.spentUsd).toBe(6)
    expect(h.statuses()).toEqual({ a: 'done', b: 'done', c: 'done', d: 'waiting' })

    h.engine.resume({ budgetCapUsd: 20 })
    await h.finished()
    expect(h.engine.view().spentUsd).toBe(8)
    expect(h.engine.view().budgetCapUsd).toBe(20)
    expect(h.engine.view().status).toBe('done')
  })

  it('does not count local tasks against the cap and still runs them when over budget', async () => {
    const h = setup(
      [ai('a'), local('l', ['a'])],
      async (t) => ({ costUsd: t.id === 'a' ? 9 : 0 }),
      { budgetCapUsd: 5 }
    )
    h.engine.start()
    await h.finished()
    expect(h.statuses()).toEqual({ a: 'done', l: 'done' })
  })
})

describe('pause and cancel', () => {
  it('user pause lets running tasks finish and starts nothing new; resume continues', async () => {
    const g = gates()
    const h = setup([ai('a'), ai('b', ['a'])], (t, s) => g.wait(t.id, s))
    h.engine.start()
    await h.until(() => h.status('a') === 'running')
    h.engine.pause()
    expect(h.engine.view().status).toBe('paused')
    expect(h.engine.view().pause?.reason).toBe('user')
    g.release('a')
    await h.until(() => h.status('a') === 'done')
    expect(h.status('b')).toBe('waiting')
    h.engine.resume()
    await h.until(() => h.status('b') === 'running')
    g.release('b')
    await h.finished()
    expect(h.engine.view().status).toBe('done')
  })

  it('cancel aborts running tasks, skips the rest, and keeps finished work', async () => {
    const g = gates()
    let aborted = false
    const h = setup([ai('done1'), ai('slow', ['done1']), ai('after', ['slow'])], async (t, s) => {
      if (t.id === 'slow') {
        s.addEventListener('abort', () => (aborted = true))
        await g.wait('slow', s)
      }
    })
    h.engine.start()
    await h.until(() => h.status('slow') === 'running')
    h.engine.cancel()
    await h.until(() => h.status('slow') === 'skipped')
    expect(aborted).toBe(true)
    expect(h.statuses()).toEqual({ done1: 'done', slow: 'skipped', after: 'skipped' })
    expect(h.engine.view().status).toBe('cancelled')
    // The final state was saved too.
    await h.engine.flush()
    expect(h.saved[h.saved.length - 1].status).toBe('cancelled')
    expect(h.saved[h.saved.length - 1].tasks[1].status).toBe('skipped')
  })

  it('cancel while a task is waiting out a retry stops it promptly', async () => {
    const h = setup(
      [ai('a')],
      async () => {
        throw perr('overloaded')
      },
      {},
      {
        sleep: async (_ms, signal) =>
          new Promise<void>((r) => signal.addEventListener('abort', () => r(), { once: true }))
      }
    )
    h.engine.start()
    await h.until(
      () => h.engine.view().tasks[0].note?.startsWith('Trying again') === true,
      'backoff note'
    )
    h.engine.cancel()
    await h.until(() => h.status('a') === 'skipped')
  })
})

describe('groups (fan-out)', () => {
  const child = (id: string): TaskDef => ai(id, ['disc'])
  const group = (kids: string[]): TaskDef => ({
    id: 'grp',
    title: 'group',
    stage: 2,
    kind: 'local',
    dependsOn: ['disc'],
    web: false,
    output: () => 'grp',
    fanOut: async () => kids.map(child)
  })

  it('creates one child per item once its dependencies are done, and dependents wait for all of them', async () => {
    const g = gates()
    const h = setup([ai('disc'), group(['k1', 'k2']), ai('after', ['grp'])], (t, s) =>
      t.id.startsWith('k') ? g.wait(t.id, s) : Promise.resolve()
    )
    h.engine.start()
    await h.until(() => h.status('k1') === 'running' && h.status('k2') === 'running', 'children')
    expect(h.engine.view().tasks.map((t) => t.id)).toEqual(['disc', 'grp', 'k1', 'k2', 'after'])
    expect(h.engine.view().tasks.find((t) => t.id === 'k1')!.parent).toBe('grp')
    expect(h.status('grp')).toBe('running')
    expect(h.status('after')).toBe('waiting')
    g.release('k1')
    await new Promise((r) => setImmediate(r))
    expect(h.status('after')).toBe('waiting')
    g.release('k2')
    await h.finished()
    expect(h.statuses()).toEqual({
      disc: 'done',
      grp: 'done',
      k1: 'done',
      k2: 'done',
      after: 'done'
    })
  })

  it('is done when at least one child succeeded, and keeps going', async () => {
    const h = setup([ai('disc'), group(['k1', 'k2']), ai('after', ['grp'])], async (t) => {
      if (t.id === 'k2') throw new Error('x')
    })
    h.engine.start()
    await h.finished()
    expect(h.statuses()).toMatchObject({ grp: 'done', k1: 'done', k2: 'failed', after: 'done' })
    expect(h.engine.view().tasks.find((t) => t.id === 'grp')!.note).toBe('Some profiles failed')
  })

  it('fails when no child succeeded, which blocks its dependents', async () => {
    const h = setup([ai('disc'), group(['k1', 'k2']), ai('after', ['grp'])], async (t) => {
      if (t.id.startsWith('k')) throw new Error('x')
    })
    h.engine.start()
    await h.finished()
    expect(h.statuses()).toMatchObject({ grp: 'failed', after: 'blocked' })
  })

  it('is done straight away when there is nothing to fan out to', async () => {
    const h = setup([ai('disc'), group([]), ai('after', ['grp'])], async () => undefined)
    h.engine.start()
    await h.finished()
    expect(h.statuses()).toEqual({ disc: 'done', grp: 'done', after: 'done' })
  })

  it('retrying a failed child retries the group and unblocks what waited on it', async () => {
    const h = setup([ai('disc'), group(['k1']), ai('after', ['grp'])], async (t, _s, n) => {
      if (t.id === 'k1' && n === 1) throw new Error('x')
    })
    h.engine.start()
    await h.finished()
    expect(h.statuses()).toMatchObject({ grp: 'failed', after: 'blocked' })
    h.engine.retryTask('k1')
    await h.finished()
    expect(h.statuses()).toEqual({ disc: 'done', grp: 'done', k1: 'done', after: 'done' })
  })
})

describe('saving and resuming', () => {
  it('saves after every change, in order, ending in the final state', async () => {
    const h = setup([ai('a'), ai('b', ['a'])], async () => undefined)
    h.engine.start()
    await h.finished()
    await h.engine.flush()
    expect(h.saved.length).toBeGreaterThan(3)
    expect(JSON.parse(JSON.stringify(h.saved[h.saved.length - 1]))).toEqual(
      JSON.parse(JSON.stringify(h.engine.view()))
    )
  })

  it('resumes an interrupted run: finished tasks are skipped, interrupted ones run again, spend is kept', async () => {
    const g = gates()
    const first = setup([ai('a'), ai('b', ['a']), ai('c', ['b']), ai('x')], async (t, s) => {
      if (t.id === 'b') await g.wait('b', s)
      return { costUsd: 1 }
    })
    first.engine.start()
    await first.until(
      () =>
        first.status('a') === 'done' &&
        first.status('b') === 'running' &&
        first.status('x') === 'done'
    )
    await first.engine.flush()
    const savedMidRun = first.saved[first.saved.length - 1]
    expect(savedMidRun.tasks.find((t) => t.id === 'b')!.status).toBe('running')

    // "Quit": a new engine from the saved file. b's output is missing, a's is still on disk.
    const verified: string[] = []
    const second = setup(
      [ai('a'), ai('b', ['a']), ai('c', ['b']), ai('x')],
      async () => ({ costUsd: 1 }),
      {},
      {
        verifyOutput: async (t) => (verified.push(t.id), t.id !== 'x')
      }
    )
    const restored = await ResearchEngine.restore(second.deps, second.options, savedMidRun)
    expect(restored.view().status).toBe('paused')
    expect(restored.view().pause?.reason).toBe('user')
    expect(restored.view().spentUsd).toBe(2)
    const statuses = Object.fromEntries(restored.view().tasks.map((t) => [t.id, t.status]))
    // a verified and kept, x finished but its output vanished so it runs again, b was interrupted
    expect(statuses).toEqual({ a: 'done', b: 'waiting', c: 'waiting', x: 'waiting' })

    restored.resume()
    await second.until(() => restored.isFinished)
    expect(second.started.sort()).toEqual(['b', 'c', 'x'])
    expect(restored.view().status).toBe('done')
    expect(restored.view().spentUsd).toBe(5)
  })

  it('restores a group and its children', async () => {
    const mk = () => [
      ai('disc'),
      {
        id: 'grp',
        title: 'g',
        stage: 2,
        kind: 'local',
        dependsOn: ['disc'],
        web: false,
        output: () => 'g',
        fanOut: async () => [ai('k1', ['disc']), ai('k2', ['disc'])]
      } as TaskDef,
      ai('after', ['grp'])
    ]
    const g = gates()
    const first = setup(mk(), (t, s) => (t.id === 'k2' ? g.wait('k2', s) : Promise.resolve()))
    first.engine.start()
    await first.until(() => first.status('k1') === 'done' && first.status('k2') === 'running')
    await first.engine.flush()
    const saved = first.saved[first.saved.length - 1]

    const second = setup(mk(), async () => undefined)
    const restored = await ResearchEngine.restore(second.deps, second.options, saved)
    expect(restored.view().tasks.map((t) => t.id)).toEqual(['disc', 'grp', 'k1', 'k2', 'after'])
    restored.resume()
    await second.until(() => restored.isFinished)
    expect(second.started.sort()).toEqual(['k2'].concat(['after']).sort())
    expect(restored.view().status).toBe('done')
  })

  it("puts a cancelled run's stopped tasks back in the queue on resume, but keeps web-skipped ones skipped", async () => {
    const g = gates()
    const first = setup(
      [ai('a'), ai('b', ['a']), web('w')],
      (t, s) => (t.id === 'a' ? g.wait('a', s) : Promise.resolve()),
      { skipWeb: true }
    )
    first.engine.start()
    await first.until(() => first.status('a') === 'running')
    first.engine.cancel()
    await first.until(() => first.status('a') === 'skipped')
    await first.engine.flush()
    const saved = first.saved[first.saved.length - 1]

    const second = setup([ai('a'), ai('b', ['a']), web('w')], async () => undefined, {
      skipWeb: true
    })
    const restored = await ResearchEngine.restore(second.deps, second.options, saved)
    expect(Object.fromEntries(restored.view().tasks.map((t) => [t.id, t.status]))).toEqual({
      a: 'waiting',
      b: 'waiting',
      w: 'skipped'
    })
  })
})

describe('scoped runs', () => {
  it('runs only the listed tasks; dependencies outside the list count as done', async () => {
    const h = setup([ai('a'), ai('b', ['a']), ai('c', ['b']), ai('x')], async () => undefined, {
      only: ['b', 'c']
    })
    h.engine.start()
    await h.finished()
    expect(h.started).toEqual(['b', 'c'])
    expect(h.engine.view().tasks.map((t) => t.id)).toEqual(['b', 'c'])
    expect(h.engine.view().scope).toEqual(['b', 'c'])
    expect(h.engine.view().status).toBe('done')
  })

  it('restores a scoped run with the same scope', async () => {
    const g = gates()
    const first = setup(
      [ai('a'), ai('b', ['a']), ai('c', ['b'])],
      (t, s) => (t.id === 'c' ? g.wait('c', s) : Promise.resolve()),
      { only: ['b', 'c'] }
    )
    first.engine.start()
    await first.until(() => first.status('c') === 'running')
    await first.engine.flush()
    const saved = first.saved[first.saved.length - 1]
    const second = setup([ai('a'), ai('b', ['a']), ai('c', ['b'])], async () => undefined)
    const restored = await ResearchEngine.restore(second.deps, second.options, saved)
    expect(restored.view().tasks.map((t) => t.id)).toEqual(['b', 'c'])
    restored.resume()
    await second.until(() => restored.isFinished)
    expect(second.started).toEqual(['c'])
  })
})
