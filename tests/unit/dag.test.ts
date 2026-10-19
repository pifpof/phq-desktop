import { existsSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { findIsolationViolations, taintedTasks } from '../../src/main/research/isolation'
import { parseCompetitors, TASKS } from '../../src/main/research/tasks'
import type { TaskContext, TaskDef } from '../../src/main/research/types'
import { emptyProfile } from '../../src/shared/profile'

const profile = emptyProfile()
profile.company.name = 'Acme'
profile.company.competitors = ['Wile Co', 'Road Runner Inc']
const ctx: TaskContext = { profile, runId: 'r', company: 'Acme', readOutput: async () => null }
const byId = new Map(TASKS.map((t) => [t.id, t]))

function ancestors(id: string, tasks = byId, seen = new Set<string>()): Set<string> {
  for (const d of tasks.get(id)?.dependsOn ?? []) {
    if (!seen.has(d)) {
      seen.add(d)
      ancestors(d, tasks, seen)
    }
  }
  return seen
}

describe('task graph', () => {
  it('has unique ids and every dependency exists', () => {
    expect(new Set(TASKS.map((t) => t.id)).size).toBe(TASKS.length)
    for (const t of TASKS)
      for (const d of t.dependsOn) expect(byId.has(d), `${t.id} -> ${d}`).toBe(true)
  })

  it('has no cycles', () => {
    const state = new Map<string, 1 | 2>()
    const visit = (id: string, path: string[]): void => {
      if (state.get(id) === 2) return
      if (state.get(id) === 1) throw new Error(`cycle: ${[...path, id].join(' -> ')}`)
      state.set(id, 1)
      for (const d of byId.get(id)!.dependsOn) visit(d, [...path, id])
      state.set(id, 2)
    }
    for (const t of TASKS) expect(() => visit(t.id, [])).not.toThrow()
  })

  it('gives every task a distinct output path', async () => {
    const children = await byId.get('competitor-profiles')!.fanOut!({
      ...ctx,
      readOutput: async () => null
    })
    const outs = [...TASKS, ...children].map((t) => t.output(ctx))
    expect(new Set(outs).size).toBe(outs.length)
    for (const o of outs) expect(o).not.toMatch(/^\/|\.\./)
  })

  it('only shows a task outputs that must already exist when it runs', () => {
    for (const t of TASKS) {
      const allowed = ancestors(t.id)
      for (const o of t.inputs?.outputs ?? [])
        expect(allowed.has(o), `${t.id} is shown ${o} but does not depend on it`).toBe(true)
    }
  })

  it('waits for the file extraction before any task is shown user files', () => {
    for (const t of TASKS) {
      if (t.inputs?.inputCategories.length)
        expect(ancestors(t.id).has('extract-input-files'), t.id).toBe(true)
    }
  })

  it('does not start a task before the stage of what it depends on', () => {
    for (const t of TASKS)
      for (const d of t.dependsOn)
        expect(byId.get(d)!.stage, `${t.id} after ${d}`).toBeLessThanOrEqual(t.stage)
  })

  it('defines AI tasks with a skill and instruction, and local tasks with a handler', () => {
    for (const t of TASKS) {
      if (t.fanOut) continue
      if (t.local) expect(t.skill, t.id).toBeUndefined()
      else {
        expect(t.skill, t.id).toBeTruthy()
        expect(t.instruction, t.id).toBeTruthy()
      }
    }
  })

  it('matches REQUIREMENTS-v1 3.1: stage 1 waits on no AI output (only on local tasks)', () => {
    const stage1 = TASKS.filter((t) => t.stage === 1)
    expect(stage1.map((t) => t.id).sort()).toEqual(
      [
        'competitor-discovery',
        'crawl-website',
        'extract-input-files',
        'find-social-profiles',
        'research-02-product',
        'research-03-market-segment',
        'research-04-customer-segment',
        'research-05-strengths',
        'research-06-weaknesses',
        'research-07-recent-developments'
      ].sort()
    )
    for (const t of stage1)
      for (const d of t.dependsOn) expect(byId.get(d)!.local, `${t.id} -> ${d}`).toBeTruthy()
  })

  // App skills that are written in later phases. Remove each name here when its skill lands.
  const PENDING_SKILLS = new Set<string>([])
  it('points at skill files that exist, apart from skills still to be written', async () => {
    const children = await byId.get('competitor-profiles')!.fanOut!(ctx)
    for (const t of [...TASKS, ...children]) {
      if (!t.skill || PENDING_SKILLS.has(t.skill)) continue
      for (const f of ['SKILL.md', ...(t.rules ?? []), ...(t.asset ? [t.asset] : [])]) {
        expect(
          existsSync(join(__dirname, '../../resources/skills', t.skill, f)),
          `${t.skill}/${f}`
        ).toBe(true)
      }
    }
  })
})

describe('isolation rule', () => {
  it('holds for every task in the pipeline, including fanned-out ones', async () => {
    const children = await byId.get('competitor-profiles')!.fanOut!(ctx)
    expect(findIsolationViolations([...TASKS, ...children])).toEqual([])
  })

  it('adds key takeaways with no web tools, and only when asked (REQUIREMENTS-v4 7.3)', () => {
    const t = byId.get('playbook-takeaways')!
    expect(t.web).toBe(false)
    expect(t.onDemand).toBe(true)
    expect(t.writes).toEqual({ kind: 'takeaways' })
    // It reads the section articles (private ones included), so it must never get web tools.
    expect(t.inputs?.inputCategories).toEqual([])
  })

  it('no web task sees user files, and no user-file task has web tools', () => {
    for (const t of TASKS) {
      if (t.web) expect(t.inputs?.inputCategories ?? [], t.id).toEqual([])
      if (t.inputs?.inputCategories.length) expect(t.web, t.id).toBe(false)
    }
  })

  it('treats the file extraction and everything built from it as carrying user content', () => {
    const tainted = taintedTasks(TASKS)
    for (const id of [
      'extract-input-files',
      'research-09-synthesis',
      'playbook-05-statement',
      'playbook-assemble',
      'messaging-analysis'
    ])
      expect(tainted.has(id), id).toBe(true)
    for (const id of [
      'crawl-website',
      'research-02-product',
      'competitor-discovery',
      'proof-gathering',
      'social-taglines'
    ])
      expect(tainted.has(id), id).toBe(false)
  })

  it('catches a web task that is shown user files', () => {
    const bad: TaskDef[] = [
      {
        id: 'bad',
        title: 'x',
        stage: 1,
        kind: 'web-research',
        dependsOn: [],
        web: { search: { maxUses: 1 } },
        inputs: { outputs: [], inputCategories: ['roadmap'] },
        output: () => 'x.md'
      }
    ]
    expect(findIsolationViolations(bad)[0]).toContain('shown user files')
  })

  it('catches a web task that depends on a task carrying user content, even indirectly', () => {
    const base = { title: 'x', stage: 1 as const, kind: 'synthesis' as const, output: () => 'x.md' }
    const bad: TaskDef[] = [
      { ...base, id: 'extract', dependsOn: [], local: 'extract', web: false },
      {
        ...base,
        id: 'middle',
        dependsOn: ['extract'],
        web: false,
        inputs: { outputs: ['extract'], inputCategories: [] }
      },
      {
        ...base,
        id: 'web',
        kind: 'web-research',
        dependsOn: ['middle'],
        web: { search: { maxUses: 1 } },
        inputs: { outputs: ['middle'], inputCategories: [] }
      }
    ]
    expect(findIsolationViolations(bad).some((p) => p.startsWith('web:'))).toBe(true)
  })

  it('catches optional inputs too', () => {
    const base = { title: 'x', stage: 1 as const, kind: 'synthesis' as const, output: () => 'x.md' }
    const bad: TaskDef[] = [
      { ...base, id: 'extract', dependsOn: [], local: 'extract', web: false },
      {
        ...base,
        id: 'web',
        kind: 'web-research',
        dependsOn: [],
        web: { search: { maxUses: 1 } },
        inputs: { outputs: [], optionalOutputs: ['extract'], inputCategories: [] }
      }
    ]
    expect(findIsolationViolations(bad)).toHaveLength(1)
  })
})

describe('parseCompetitors', () => {
  it('reads a markdown table, skipping the header and separator', () => {
    const md =
      '# Competitors\n\n| Name | Website | One line | Type |\n|---|---|---|---|\n| **Wile Co** | https://wile.example | Rockets | Direct |\n| Road Runner Inc | roadrunner.example/about | Fast | Indirect |\n| wile co | x.com | dup | Direct |\n'
    expect(parseCompetitors(md)).toEqual([
      { name: 'Wile Co', website: 'https://wile.example', type: 'Direct' },
      { name: 'Road Runner Inc', website: 'roadrunner.example/about', type: 'Indirect' }
    ])
  })
  it('profiles companies but not the status quo, and falls back to the names the user typed', async () => {
    const md =
      '| Name | Website | One line | Type |\n|---|---|---|---|\n| Wile Co | wile.example | Rockets | Direct |\n| Spreadsheets | n/a | Manual tracking | Status quo |\n| Agency | n/a | Outsourced | Indirect |'
    const group = TASKS.find((t) => t.id === 'competitor-profiles')!
    const kids = await group.fanOut!({ ...ctx, readOutput: async () => md })
    expect(kids.map((k) => k.title)).toEqual(['Profile: Wile Co'])
    const fallback = await group.fanOut!({ ...ctx, readOutput: async () => 'no table' })
    expect(fallback.map((k) => k.title)).toEqual(['Profile: Wile Co', 'Profile: Road Runner Inc'])
  })

  it('ignores other tables and only reads the one with Name and Website columns', () => {
    const md =
      '| a | b |\n|---|---|\n| 1 | 2 |\n\n| Plan | Price |\n|---|---|\n| Pro | $9 |\n\n| Website | Competitor | Type |\n|---|---|---|\n| [wile.example](https://wile.example) | Wile Co | Direct |'
    expect(parseCompetitors(md)).toEqual([
      { name: 'Wile Co', website: 'https://wile.example', type: 'Direct' }
    ])
    expect(parseCompetitors('| a | b |\n|---|---|\n| 1 | 2 |')).toEqual([])
  })

  it('caps at five and tolerates junk', () => {
    const rows = Array.from({ length: 8 }, (_, i) => `| Co ${i} | co${i}.com | x | y |`).join('\n')
    expect(parseCompetitors(`| Name | Site |\n|---|---|\n${rows}`)).toHaveLength(6)
    expect(parseCompetitors(`| Name | Notes |\n|---|---|\n${rows}`)).toEqual([])
    expect(parseCompetitors('no table here')).toEqual([])
  })
})
