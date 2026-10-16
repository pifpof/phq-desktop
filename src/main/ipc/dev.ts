import { app } from 'electron'
import type { AppContext } from '../context'
import { getProvider } from '../providers/registry'
import { ProviderError, TaskAbortedError } from '../providers/types'
import { buildPrompt, diskSkillReader } from '../research/prompt-builder'
import { costOf } from '../research/pricing'
import { loadPricing, skillsDir } from '../research/resources'
import { readProfile } from '../workspace/profile'
import { HandlerError, type Handle } from './register'

/** Dev-only ways to run local ingestion directly. Never available in a packaged app. */
export function registerDev(handle: Handle, ctx: AppContext): void {
  const root = (): string => {
    if (app.isPackaged) throw new HandlerError('not_allowed')
    const r = ctx.settings.get().workspacePath
    if (!r) throw new HandlerError('no_workspace')
    return r
  }

  const STEP_ASSETS: Record<string, string> = {
    '01': '01-company-overview',
    '02': '02-product-analysis',
    '03': '03-market-segment',
    '04': '04-customer-segment',
    '05': '05-strengths',
    '06': '06-weaknesses',
    '07': '07-recent-developments'
  }

  /** Runs one company-research step for the workspace's company, with web search. */
  handle('dev:runStep', async ({ step, web }) => {
    const ws = root()
    const profile = await readProfile(ws)
    if (!profile?.company.name) throw new HandlerError('no_workspace')
    const key = ctx.secrets.loadKey()
    const { model, provider } = ctx.settings.get()
    if (!key || !model) throw new HandlerError('no_key')
    const useWeb = web !== false
    const { system, user } = buildPrompt(
      {
        skill: 'company-research',
        rules: ['references/format-rules.md'],
        asset: `assets/${STEP_ASSETS[step]}.md`,
        profile,
        web: useWeb,
        instruction: 'Produce the document for this step now.'
      },
      diskSkillReader(skillsDir())
    )
    try {
      const result = await getProvider(provider).runTask({
        key,
        model,
        system,
        user,
        tools: useWeb
          ? { webSearch: { maxUses: 5 }, webFetch: { maxUses: 3, maxContentTokens: 20_000 } }
          : {},
        signal: new AbortController().signal
      })
      const cost = costOf(loadPricing(), model, result.usage)
      const { maxRequestInputTokens: _max, ...usage } = result.usage
      void _max
      return {
        text: result.text,
        citations: result.citations,
        consulted: result.consulted,
        stopReason: result.stopReason,
        usage,
        costUsd: cost.usd,
        costApproximate: cost.approximate,
        model
      }
    } catch (err) {
      if (err instanceof ProviderError) throw new HandlerError(err.code, err.detail)
      if (err instanceof TaskAbortedError) throw new HandlerError('internal')
      throw err
    }
  })
}
