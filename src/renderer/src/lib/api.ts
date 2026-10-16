import type { Result } from '@shared/ipc-contract'
import { errorMessage } from '@shared/errors'

/** The only way the renderer talks to the main process. */
export const api = window.api

/** Unwraps a Result, throwing a plain Error with safe display text on failure. */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export async function unwrap<T>(p: Promise<Result<T>>): Promise<T> {
  try {
    const r = await p
    if (r.ok) return r.data
    throw new ApiError(r.error.code, r.error.message)
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw new ApiError('internal', errorMessage('internal'))
  }
}

export function openExternal(url: string): void {
  void api.openExternal(url)
}
