import type { AppContext } from '../context'
import { ResearchError } from '../research/service'
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
  handle('research:start', (options) => run(() => ctx.research.start(options)))
  handle('research:getRun', () => run(() => ctx.research.getRun()))
  handle('research:pause', () => run(async () => (await ctx.research.pause(), null)))
  handle('research:resume', (options) =>
    run(async () => (await ctx.research.resume(options), null))
  )
  handle('research:cancel', () => run(async () => (await ctx.research.cancel(), null)))
  handle('research:retryTask', ({ taskId }) =>
    run(async () => (await ctx.research.retryTask(taskId), null))
  )
  handle('research:setBudget', ({ budgetCapUsd }) =>
    run(async () => (await ctx.research.setBudget(budgetCapUsd), null))
  )
}
