import { appendFileSync, mkdirSync, renameSync, statSync } from 'fs'
import { join } from 'path'

const MAX_BYTES = 5 * 1024 * 1024
const KEY_PATTERN = /sk-ant-[A-Za-z0-9_-]+/g

export function redact(text: string): string {
  return text.replace(KEY_PATTERN, 'sk-ant-[redacted]')
}

export interface Logger {
  info(msg: string): void
  warn(msg: string): void
  error(msg: string): void
}

/** Append-only log in `dir`, rotated at 5 MB. Never log message content or keys. */
export function createLogger(dir: string): Logger {
  const file = join(dir, 'main.log')
  let ready = false
  const write = (level: string, msg: string): void => {
    try {
      if (!ready) {
        mkdirSync(dir, { recursive: true })
        ready = true
      }
      try {
        if (statSync(file).size > MAX_BYTES) renameSync(file, join(dir, 'main.old.log'))
      } catch {
        // no file yet
      }
      appendFileSync(file, `${new Date().toISOString()} ${level} ${redact(msg)}\n`)
    } catch {
      // logging must never crash the app
    }
  }
  return {
    info: (m) => write('INFO', m),
    warn: (m) => write('WARN', m),
    error: (m) => write('ERROR', m)
  }
}
