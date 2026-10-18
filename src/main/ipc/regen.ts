import type { AppContext } from '../context'
import { discardJob, readJob, reviewJob } from '../research/regen-job'
import { planRegeneration } from '../research/regen-plan'
import {
  editsToChange,
  keepRegeneration,
  RegenError,
  startRegeneration
} from '../research/regenerate'
import { listHistory, readHistoryFiles } from '../state/history'
import { parseDoc, stringField } from '../wiki/frontmatter'
import { workspaceRoot, writableRoot } from './guard'
import { HandlerError, type Handle } from './register'

/** Regenerate preview, regeneration and review (REQUIREMENTS-v3.1 4, 5). */
export function registerRegen(handle: Handle, ctx: AppContext): void {
  const root = (): string => workspaceRoot(ctx)
  const mapped = async <T>(f: () => Promise<T>): Promise<T> => {
    try {
      return await f()
    } catch (err) {
      if (err instanceof RegenError) throw new HandlerError(err.code)
      throw err
    }
  }

  // Nothing runs and nothing is spent: the preview only reads (REQUIREMENTS-v3.1 4).
  handle('regen:plan', async ({ page }) => planRegeneration(root(), page, ctx.research.planDeps()))

  handle('regen:start', async (req) => {
    const r = await writableRoot(ctx)
    const plan = await planRegeneration(r, req.page, ctx.research.planDeps())
    const queue = req.dependents ? (plan?.dependents.map((x) => x.slug) ?? []) : []
    return mapped(() => startRegeneration(ctx.research, r, { ...req, queue }))
  })

  handle('regen:job', async () => readJob(root()))
  handle('regen:review', async () => reviewJob(root()))
  handle('regen:keep', async () => {
    const r = await writableRoot(ctx)
    return mapped(() => keepRegeneration(ctx.research, r, ctx.settings.get().model ?? ''))
  })
  handle('regen:discard', async () => {
    await discardJob(await writableRoot(ctx))
    return null
  })

  handle('regen:changeHistory', async ({ id }) => {
    const entry = (await listHistory(root())).find((e) => e.changes.includes(id))
    if (!entry) return null
    return (await readHistoryFiles(entry)).map((f) => ({
      ...f,
      title: stringField(parseDoc(f.after)?.data.title) || f.rel
    }))
  })

  handle('regen:editsToChange', async ({ page }) =>
    mapped(async () => editsToChange(await writableRoot(ctx), page))
  )
}
