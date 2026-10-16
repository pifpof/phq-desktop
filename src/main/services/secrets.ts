import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Logger } from '../log'

export interface SafeStorageLike {
  encryptString(s: string): Buffer
  decryptString(b: Buffer): string
}

export interface SecretsDeps {
  dir: string
  safeStorage: SafeStorageLike
  /** Whether the OS can store the key securely (see platform/). */
  isSecure: () => boolean
  log: Pick<Logger, 'warn'>
}

export interface SecretsStore {
  isSecureStorageAvailable(): boolean
  saveKey(key: string): { persisted: boolean }
  loadKey(): string | null
  deleteKey(): void
  maskedKey(): string | null
}

export function mask(key: string): string {
  return `sk-ant-...${key.slice(-4)}`
}

/** The key is only ever written through safeStorage. Without secure storage it lives in memory. */
export function createSecretsStore({ dir, safeStorage, isSecure, log }: SecretsDeps): SecretsStore {
  const file = join(dir, 'secrets.bin')
  let sessionKey: string | null = null

  const removeFile = (): void => rmSync(file, { force: true })

  return {
    isSecureStorageAvailable: isSecure,

    saveKey(key) {
      if (!isSecure()) {
        sessionKey = key
        removeFile()
        return { persisted: false }
      }
      mkdirSync(dir, { recursive: true })
      const tmp = `${file}.tmp`
      writeFileSync(tmp, safeStorage.encryptString(key), { mode: 0o600 })
      renameSync(tmp, file)
      sessionKey = null
      return { persisted: true }
    },

    loadKey() {
      if (sessionKey) return sessionKey
      if (!existsSync(file)) return null
      try {
        return safeStorage.decryptString(readFileSync(file))
      } catch (err) {
        log.warn(`Could not decrypt stored key (${err instanceof Error ? err.name : 'unknown'})`)
        return null
      }
    },

    deleteKey() {
      sessionKey = null
      removeFile()
    },

    maskedKey() {
      const key = this.loadKey()
      return key ? mask(key) : null
    }
  }
}
