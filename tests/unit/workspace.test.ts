import { chmodSync, mkdtempSync, readFileSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  confirmWorkspace,
  defaultWorkspacePath,
  markerPath
} from '../../src/main/services/workspace'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'phq-ws-'))

describe('workspace', () => {
  it('builds the default path under documents', () => {
    expect(defaultWorkspacePath('/docs')).toBe(join('/docs', 'PositioningHQ'))
  })

  it('creates the marker and nothing else', async () => {
    const dir = join(tmp(), 'new')
    expect(await confirmWorkspace(dir, '1.2.3')).toEqual({ existing: false })
    const marker = JSON.parse(readFileSync(markerPath(dir), 'utf8'))
    expect(marker).toMatchObject({ schemaVersion: 1, appVersion: '1.2.3' })
    expect(readdirSync(dir)).toEqual(['.positioninghq'])
  })

  it('recognises an existing workspace and keeps its marker', async () => {
    const dir = tmp()
    await confirmWorkspace(dir, '1.0.0')
    expect(await confirmWorkspace(dir, '2.0.0')).toEqual({ existing: true })
    expect(JSON.parse(readFileSync(markerPath(dir), 'utf8')).appVersion).toBe('1.0.0')
  })

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'rejects an unwritable folder',
    async () => {
      const dir = tmp()
      chmodSync(dir, 0o500)
      expect(await confirmWorkspace(dir, '1.0.0')).toBeNull()
      chmodSync(dir, 0o700)
    }
  )
})
