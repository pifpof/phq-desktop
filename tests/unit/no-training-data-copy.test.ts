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

/** The pane is called Wiki from v3 (REQUIREMENTS-v3 2). */
describe('copy', () => {
  it('never calls the wiki "Training Data"', () => {
    const hits = sourceFiles(SRC).flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, at: `${f.slice(SRC.length + 1)}:${i + 1}` }))
        .filter(({ line }) => /training[\s_-]?data/i.test(line))
        .map(({ at }) => at)
    )
    expect(hits).toEqual([])
  })
})
