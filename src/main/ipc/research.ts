import type { AppContext } from '../context'
import { ResearchError } from '../research/service'
import { writableRoot } from './guard'
import { HandlerError, type Handle } from './register'

/** Research service errors carry a code the person can act on. */
async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof ResearchError) throw new HandlerError(err.code)
    throw err
  }
}

export function registerResearch(handle: Handle, ctx: AppContext): void {
  handle('research:estimate', () => run(() => ctx.research.estimate()))
  handle('research:start', async (options) => {
    await writableRoot(ctx)
    return run(() => ctx.research.start(options))
  })
  handle('research:getRun', () => run(() => ctx.research.getRun()))
  handle('research:pause', () => run(async () => (await ctx.research.pause(), null)))
  handle('research:resume', async (options) => {
    await writableRoot(ctx)
    return run(async () => (await ctx.research.resume(options), null))
  })
  handle('research:cancel', () => run(async () => (await ctx.research.cancel(), null)))
  handle('research:retryTask', async ({ taskId }) => {
    await writableRoot(ctx)
    return run(async () => (await ctx.research.retryTask(taskId), null))
  })
  handle('research:rerun', async (target) => {
    await writableRoot(ctx)
    return run(() => ctx.research.rerun(target))
  })
  handle('research:catalog', () => run(() => ctx.research.catalog()))
  handle('research:taskStates', () => run(() => ctx.research.taskStates()))
  handle('research:doneStats', ({ runId }) => run(() => ctx.research.doneStats(runId)))
  handle('research:markDoneSeen', ({ runId }) =>
    run(async () => (await ctx.research.markDoneSeen(runId), null))
  )
  handle('research:runTasks', async ({ taskIds, budgetCapUsd }) => {
    await writableRoot(ctx)
    return run(() => ctx.research.runTasks(taskIds, { budgetCapUsd }))
  })
  handle('research:setBudget', ({ budgetCapUsd }) =>
    run(async () => (await ctx.research.setBudget(budgetCapUsd), null))
  )
}
