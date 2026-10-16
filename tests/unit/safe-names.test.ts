import { describe, expect, it } from 'vitest'
import { safeName } from '../../src/main/workspace/safe-name'
import { resolveInside } from '../../src/main/workspace/paths'

describe('safeName', () => {
  it('replaces characters unsafe on any OS', () => {
    expect(safeName('Acme / Co: "The *Best*"? <v2> | x\\y')).toBe(
      'Acme - Co- -The -Best--- -v2- - x-y'
    )
  })
  it('trims, collapses spaces and drops trailing dots', () => {
    expect(safeName('  Acme   Inc.  ')).toBe('Acme Inc')
    expect(safeName('...hidden')).toBe('hidden')
  })
  it('caps length at 60', () => {
    expect(safeName('a'.repeat(100))).toHaveLength(60)
  })
  it('falls back when nothing is left and avoids Windows reserved names', () => {
    expect(safeName('   ')).toBe('Company')
    expect(safeName('///')).toBe('---')
    expect(safeName('CON')).toBe('CON_')
  })
})

describe('resolveInside', () => {
  const root = '/ws'
  it('allows paths inside the workspace', () => {
    expect(resolveInside(root, 'memory/a.md')).toBe('/ws/memory/a.md')
  })
  it('refuses traversal, absolute paths and empty input', () => {
    expect(resolveInside(root, '../etc/passwd')).toBeNull()
    expect(resolveInside(root, 'memory/../../x')).toBeNull()
    expect(resolveInside(root, '/etc/passwd')).toBeNull()
    expect(resolveInside(root, '')).toBeNull()
    expect(resolveInside(root, '.')).toBeNull()
  })
})
