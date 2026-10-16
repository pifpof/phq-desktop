import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { createSecretsStore, mask } from '../../src/main/services/secrets'

const fakeSafeStorage = {
  encryptString: (s: string) => Buffer.from(`enc:${s.split('').reverse().join('')}`),
  decryptString: (b: Buffer) => {
    const t = b.toString()
    if (!t.startsWith('enc:')) throw new Error('bad blob')
    return t.slice(4).split('').reverse().join('')
  }
}
const KEY = 'sk-ant-api03-abcdefgh1234'

function make(secure = true) {
  const dir = mkdtempSync(join(tmpdir(), 'phq-secrets-'))
  const log = { warn: vi.fn() }
  return {
    dir,
    log,
    store: createSecretsStore({ dir, safeStorage: fakeSafeStorage, isSecure: () => secure, log })
  }
}

describe('secrets', () => {
  it('round trips through encrypted storage and never writes plaintext', () => {
    const { dir, store } = make()
    expect(store.saveKey(KEY)).toEqual({ persisted: true })
    expect(readFileSync(join(dir, 'secrets.bin'), 'utf8')).not.toContain(KEY)
    expect(store.loadKey()).toBe(KEY)
  })

  it('keeps the key in memory only when secure storage is unavailable', () => {
    const { dir, store } = make(false)
    expect(store.saveKey(KEY)).toEqual({ persisted: false })
    expect(existsSync(join(dir, 'secrets.bin'))).toBe(false)
    expect(store.loadKey()).toBe(KEY)
  })

  it('returns null when missing or undecryptable, and logs no content', () => {
    const { dir, store, log } = make()
    expect(store.loadKey()).toBeNull()
    writeFileSync(join(dir, 'secrets.bin'), 'garbage')
    expect(store.loadKey()).toBeNull()
    expect(log.warn).toHaveBeenCalledOnce()
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('garbage')
  })

  it('deletes the key', () => {
    const { store } = make()
    store.saveKey(KEY)
    store.deleteKey()
    expect(store.loadKey()).toBeNull()
  })

  it('masks to the last 4 characters', () => {
    expect(mask(KEY)).toBe('sk-ant-...1234')
    expect(make().store.maskedKey()).toBeNull()
  })
})
