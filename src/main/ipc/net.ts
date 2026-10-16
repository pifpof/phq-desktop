import { net } from 'electron'
import { normalizeWebsite } from '@shared/url'
import type { AppContext } from '../context'
import { userAgent } from '../user-agent'
import type { Handle } from './register'

const TIMEOUT_MS = 10_000

export function registerNet(handle: Handle, ctx: AppContext): void {
  /** Does this website answer at all? Any HTTP response counts, even 403 from bot protection. */
  handle('net:checkUrl', async ({ url }) => {
    const target = normalizeWebsite(url)
    if (!target) return { reachable: false, finalUrl: null }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await net.fetch(target, {
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'user-agent': userAgent(ctx.appVersion) }
      })
      void res.body?.cancel()
      return { reachable: true, finalUrl: res.url || target }
    } catch {
      return { reachable: false, finalUrl: null }
    } finally {
      clearTimeout(timer)
    }
  })
}
