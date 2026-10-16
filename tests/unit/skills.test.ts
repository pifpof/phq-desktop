import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import matter from 'gray-matter'
import { describe, expect, it } from 'vitest'
import { roleOf } from '../../src/main/research/prompt-builder'

const dir = join(__dirname, '../../resources/skills')
const skills = readdirSync(dir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)

describe('bundled skills', () => {
  it.each(skills)(
    '%s has valid front matter, a role sentence and no em dashes in app-written files',
    (skill) => {
      const text = readFileSync(join(dir, skill, 'SKILL.md'), 'utf8')
      const fm = matter(text).data
      expect(typeof fm.name).toBe('string')
      expect(typeof fm.description).toBe('string')
      expect(roleOf(text)).toMatch(/^You are .+\.$/)
      const vendored = ['company-research', 'positioning-playbook'].includes(skill)
      if (!vendored) {
        const files = [
          text,
          ...readdirSync(join(dir, skill), { recursive: true, withFileTypes: true })
            .filter((e) => e.isFile())
            .map((e) => readFileSync(join(e.parentPath, e.name), 'utf8'))
        ]
        for (const f of files) expect(f).not.toContain(String.fromCharCode(0x2014))
      }
    }
  )
})
