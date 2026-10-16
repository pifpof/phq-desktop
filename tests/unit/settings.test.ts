import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { createSettingsStore, defaultSettings } from '../../src/main/services/settings'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'phq-settings-'))

describe('settings', () => {
  it('returns defaults when no file exists', () => {
    expect(createSettingsStore(tmp()).get()).toEqual(defaultSettings())
  })

  it('falls back to defaults on a corrupt file', () => {
    const dir = tmp()
    writeFileSync(join(dir, 'settings.json'), '{not json')
    expect(createSettingsStore(dir).get()).toEqual(defaultSettings())
  })

  it('writes atomically and persists across stores', () => {
    const dir = tmp()
    createSettingsStore(dir).update({ onboardingComplete: true, model: 'm' })
    expect(existsSync(join(dir, 'settings.json.tmp'))).toBe(false)
    const next = createSettingsStore(dir).get()
    expect(next.onboardingComplete).toBe(true)
    expect(next.model).toBe('m')
  })

  it('never stores a key field', () => {
    const dir = tmp()
    createSettingsStore(dir).update({ model: 'm' })
    expect(readFileSync(join(dir, 'settings.json'), 'utf8')).not.toMatch(/sk-ant|apiKey|key/i)
  })
})
