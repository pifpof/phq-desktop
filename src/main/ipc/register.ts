import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { channels, type ChannelName, type Req, type Res, type Result } from '@shared/ipc-contract'
import { errorMessage, type ErrorCode } from '@shared/errors'
import type { Logger } from '../log'
import { ProviderError } from '../providers/types'
import { isAppUrl } from '../window'

/** Throw from a handler to return `{ ok: false, error }` to the renderer. */
export class HandlerError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly detail?: string
  ) {
    super(code)
  }
}

export function fromProviderError(err: unknown): HandlerError {
  if (err instanceof ProviderError) return new HandlerError(err.code, err.detail)
  return new HandlerError('internal')
}

const fail = (code: ErrorCode, detail?: string): Result<never> => ({
  ok: false,
  error: { code, message: errorMessage(code, detail) }
})

/** Registers a channel: checks the sender, validates the payload with zod, never throws across IPC. */
export function makeHandle(log: Logger) {
  return function handle<C extends ChannelName>(
    channel: C,
    fn: (payload: Req<C>, event: IpcMainInvokeEvent) => Promise<Res<C>> | Res<C>
  ): void {
    ipcMain.handle(channel, async (event, raw): Promise<Result<Res<C>>> => {
      const frameUrl = event.senderFrame?.url ?? ''
      if (!isAppUrl(frameUrl)) {
        log.warn(`Rejected ${channel} from unexpected sender`)
        return fail('forbidden')
      }
      const parsed = channels[channel].req.safeParse(raw)
      if (!parsed.success) return fail('invalid_payload')
      try {
        return { ok: true, data: await fn(parsed.data as Req<C>, event) }
      } catch (err) {
        if (err instanceof HandlerError) return fail(err.code, err.detail)
        log.error(`${channel} failed: ${err instanceof Error ? err.message : 'unknown error'}`)
        return fail('internal')
      }
    })
  }
}

export type Handle = ReturnType<typeof makeHandle>
