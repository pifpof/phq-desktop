import { readdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(__dirname, '../../src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(p)
    return /\.(ts|tsx|html)$/.test(e.name) ? [p] : []
  })
}

const hits = (re: RegExp): string[] =>
  sourceFiles(SRC).flatMap((f) =>
    readFileSync(f, 'utf8')
      .split('\n')
      .map((line, i) => ({ line, at: `${f.slice(SRC.length + 1)}:${i + 1}` }))
      .filter(({ line }) => re.test(line))
      .map(({ at }) => at)
  )

describe('copy', () => {
  // The pane is called Wiki from v3 (REQUIREMENTS-v3 2).
  it('never calls the wiki "Training Data"', () => {
    expect(hits(/training[\s_-]?data/i)).toEqual([])
  })

  // Founders make changes, not decisions (REQUIREMENTS-v3.1 1).
  it('never asks to "record a decision"', () => {
    expect(hits(/record (a|as) decision/i)).toEqual([])
  })
})
