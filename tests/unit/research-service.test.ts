import { mkdirSync, mkdtempSync, readFileSync, readdirSync, existsSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import matter from 'gray-matter'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ProviderError,
  type Provider,
  type RunTaskArgs,
  type RunTaskResult
} from '../../src/main/providers/types'
import { assembleCompanyResearch, assemblePlaybook } from '../../src/main/research/assemble'
import { extractInputs } from '../../src/main/ingest/extract'
import { diskSkillReader } from '../../src/main/research/prompt-builder'
import { parsePricing } from '../../src/main/research/pricing'
import {
  createResearchService,
  ResearchError,
  type ServiceDeps
} from '../../src/main/research/service'
import { latestRun } from '../../src/main/research/run-store'
import { TASKS } from '../../src/main/research/tasks'
import { addInputs } from '../../src/main/workspace/inputs'
import { createLayout } from '../../src/main/workspace/layout'
import { writeProfile } from '../../src/main/workspace/profile'
import { emptyProfile } from '../../src/shared/profile'
import type { RunView } from '../../src/shared/research'

const root = join(__dirname, '../..')
// Skills written in later phases. Until they exist, the test stands in a stub so the whole graph can run.
const PENDING = new Set([
  'website-positioning',
  'social-taglines',
  'competitor-discovery',
  'competitor-profile',
  'proof-gathering',
  'messaging-analysis'
])
const disk = diskSkillReader(join(root, 'resources/skills'))
const readSkill = (skill: string, file: string): string =>
  PENDING.has(skill) && !existsSync(join(root, 'resources/skills', skill, file))
    ? file === 'SKILL.md'
      ? 'You are a stub skill for tests.'
      : ''
    : disk(skill, file)
const pricing = parsePricing(JSON.parse(readFileSync(join(root, 'resources/pricing.json'), 'utf8')))
const SECRET = 'CONFIDENTIAL-BOARD-NUMBERS-7731'

interface Call {
  id: string
  web: boolean
  text: string
  tools: RunTaskArgs['tools']
}

function fakeProvider(
  opts: {
    webSearch?: boolean
    onCall?: (c: Call, signal: AbortSignal) => Promise<void> | void
    failWeb?: boolean
  } = {}
) {
  const calls: Call[] = []
  let running = 0
  let peak = 0
  const provider = {
    id: 'anthropic',
    displayName: 'Fake',
    verifyKey: async () => ({ ok: false as const, code: 'unknown' as const }),
    pickDefaultModel: () => null,
    listModels: async () => [],
    streamChat: async () => undefined,
    capabilities: async () => ({
      webSearch: opts.webSearch ?? true,
      webFetch: opts.webSearch ?? true
    }),
    runTask: async (a: RunTaskArgs): Promise<RunTaskResult> => {
      const text = [...a.system, ...a.user].map((b) => b.text).join('\n')
      const instruction = a.user[a.user.length - 1].text
      const call: Call = { id: instruction, web: !!a.tools.webSearch, text, tools: a.tools }
      calls.push(call)
      running++
      peak = Math.max(peak, running)
      try {
        await new Promise((r) => setTimeout(r, 2))
        if (opts.failWeb && call.web) throw new ProviderError('web_search_disabled')
        await opts.onCall?.(call, a.signal)
        if (a.signal.aborted) throw new Error('aborted')
        const body = /most relevant competitors now/.test(instruction)
          ? '# Competitors\n\n| Name | Website | One line | Type |\n|---|---|---|---|\n| Wile Co | wile.example | Rockets | Direct |\n| Road Runner Inc | roadrunner.example | Speed | Indirect |'
          : `# Output\n\nWritten for: ${instruction.slice(0, 40)} — with a dash.\n\n\`\`\`\ncode — stays\n\`\`\``
        return {
          text: body,
          citations: a.tools.webSearch
            ? [{ url: 'https://source.example/a', title: 'Source A' }]
            : [],
          consulted: a.tools.webSearch
            ? [{ url: 'https://source.example/b', title: 'Source B' }]
            : [],
          usage: {
            inputTokens: 10_000,
            outputTokens: 1000,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            webSearchRequests: a.tools.webSearch ? 2 : 0,
            webFetchRequests: 0,
            maxRequestInputTokens: 10_000,
            requests: 1
          },
          stopReason: 'end_turn',
          truncated: false
        }
      } finally {
        running--
      }
    }
  } as unknown as Provider
  return { provider, calls, peak: () => peak }
}

let ws: string
const logs: string[] = []
beforeEach(async () => {
  ws = mkdtempSync(join(tmpdir(), 'phq-svc-'))
  await createLayout(ws)
  const p = emptyProfile()
  p.company = {
    name: 'Acme Rockets',
    website: 'https://acme.example',
    productName: '',
    description: 'Rockets',
    competitors: []
  }
  p.user = { name: 'Sam', role: 'Founder or CEO', roleOther: '', companySize: 'Just me' }
  p.goals = ['positioning']
  await writeProfile(ws, p)
  const src = mkdtempSync(join(tmpdir(), 'phq-svc-src-'))
  writeFileSync(join(src, 'board.txt'), `Board notes. ${SECRET}`)
  await addInputs(ws, 'company strategy', [join(src, 'board.txt')])
})

const fakeLocal = (): ServiceDeps['local'] => ({
  crawl: async ({ root: r }) => {
    mkdirSync(join(r, 'memory/research/website/pages'), { recursive: true })
    writeFileSync(
      join(r, 'memory/research/website/index.md'),
      '---\nstatus: draft\n---\n# Website crawl\n'
    )
    writeFileSync(
      join(r, 'memory/research/website/pages/home.md'),
      '---\nstatus: draft\n---\n# Home\n\nWe sell rockets to coyotes.'
    )
    return { output: 'memory/research/website/index.md' }
  },
  extract: async ({ root: r, runId }) => {
    await extractInputs(r, runId)
    return { output: 'memory/research/inputs-extracted/index.md' }
  },
  // The real assembly steps, so the test covers the playbook and its versions.
  'assemble-company-research': ({ root: r, profile, runId }) =>
    assembleCompanyResearch({ root: r, profile, runId }),
  'assemble-playbook': ({ root: r, profile, runId }) =>
    assemblePlaybook({ root: r, profile, runId })
})

function makeService(provider: Provider, over: Partial<ServiceDeps> = {}) {
  const events: RunView[] = []
  const finished: RunView[] = []
  const service = createResearchService({
    getRoot: () => ws,
    getModel: () => 'claude-sonnet-5-5',
    getKey: () => 'sk-ant-test',
    provider: () => provider,
    pricing: () => pricing,
    readSkill,
    local: fakeLocal(),
    send: (r) => void events.push(r),
    onFinished: (r) => void finished.push(r),
    log: {
      info: () => undefined,
      warn: (m: string) => void logs.push(m),
      error: (m: string) => void logs.push(m)
    },
    engine: { sleep: async () => undefined, random: () => 0 },
    ...over
  })
  const until = async (cond: () => boolean, label: string) => {
    for (let i = 0; i < 700; i++) {
      if (cond()) return
      await new Promise((r) => setTimeout(r, 4))
    }
    const last = events[events.length - 1]
    throw new Error(
      `timed out: ${label}; ${last?.status} ${JSON.stringify(last?.tasks.map((t) => `${t.id}:${t.status}`))}`
    )
  }
  const last = () => events[events.length - 1]
  return { service, events, finished, until, last }
}

describe('research service: the full pipeline', () => {
  it('runs every task, writes every output with front matter, and finishes done', async () => {
    const f = fakeProvider()
    const s = makeService(f.provider)
    await s.service.start()
    await s.until(() => s.finished.length === 1, 'run to finish')
    const run = s.last()
    expect(logs).toEqual([])
    expect(
      run.tasks
        .filter((t) => t.status !== 'done')
        .map((t) => `${t.id}:${t.status}:${t.error?.message}`)
    ).toEqual([])
    expect(run.status).toBe('done')
    expect(run.tasks.filter((t) => t.status !== 'done').map((t) => `${t.id}:${t.status}`)).toEqual(
      []
    )
    // 2 competitors were found, so two profile tasks exist under the group.
    expect(run.tasks.filter((t) => t.parent === 'competitor-profiles').map((t) => t.id)).toEqual([
      'competitor-profiles:wile-co',
      'competitor-profiles:road-runner-inc'
    ])

    for (const t of run.tasks) {
      if (!t.output || !t.output.endsWith('.md')) continue
      const file = join(ws, t.output)
      expect(existsSync(file), t.output).toBe(true)
      expect(matter(readFileSync(file, 'utf8')).data.status, t.output).toBe('draft')
    }

    // AI output is cleaned: no em dashes in prose, code untouched, sources listed for web tasks.
    const web = matter(
      readFileSync(join(ws, 'memory/company-research/steps/02-product-analysis.md'), 'utf8')
    )
    const prose = web.content.replace(/```[\s\S]*?```/g, '')
    expect(prose).not.toContain('\u2014')
    expect(prose).toContain(', with a dash.')
    expect(web.content).toContain('code — stays')
    expect(web.content).toContain('## Sources')
    expect(web.content).toContain('[Source A](https://source.example/a)')
    expect(web.data).toMatchObject({
      task: 'research-02-product',
      run_id: run.id,
      model: 'claude-sonnet-5-5'
    })
    expect(web.data.sources).toEqual(['https://source.example/a'])
    const syn = matter(
      readFileSync(join(ws, 'memory/company-research/steps/09-synthesis.md'), 'utf8')
    )
    expect(syn.content).not.toContain('## Sources')

    // The run file on disk is the final state.
    await s.service.flush()
    const saved = await latestRun(ws)
    expect(saved?.status).toBe('done')
    expect(saved?.spentUsd).toBeCloseTo(run.spentUsd, 6)
    expect(run.spentUsd).toBeGreaterThan(0.1)
  })

  it('runs independent stage 1 tasks in parallel, within the concurrency limit', async () => {
    const f = fakeProvider()
    const s = makeService(f.provider)
    await s.service.start({ concurrency: 3 })
    await s.until(() => s.finished.length === 1, 'finish')
    expect(f.peak()).toBeGreaterThanOrEqual(2)
    expect(f.peak()).toBeLessThanOrEqual(3)
  })

  it('keeps user files and web tools apart in every call', async () => {
    const f = fakeProvider()
    const s = makeService(f.provider)
    await s.service.start()
    await s.until(() => s.finished.length === 1, 'finish')
    const webCalls = f.calls.filter((c) => c.web)
    const withSecret = f.calls.filter((c) => c.text.includes(SECRET))
    expect(webCalls.length).toBeGreaterThan(8)
    expect(withSecret.length).toBeGreaterThan(0)
    // No call that could search the web ever saw the confidential file.
    for (const c of webCalls) expect(c.text, c.id).not.toContain(SECRET)
    // And every call that saw it had no tools.
    for (const c of withSecret) expect(c.tools, c.id).toEqual({})
    // The confidential text did not leak into web-task outputs on disk either.
    const social = readFileSync(join(ws, 'memory/research/competitors/Wile Co.md'), 'utf8')
    expect(social).not.toContain(SECRET)
  })

  it('puts the right documents in front of the right task', async () => {
    const f = fakeProvider()
    const s = makeService(f.provider)
    await s.service.start()
    await s.until(() => s.finished.length === 1, 'finish')
    const positioningCall = f.calls.find((c) =>
      c.id.startsWith('Write the website positioning audit')
    )!
    expect(positioningCall.text).toContain('We sell rockets to coyotes.')
    expect(positioningCall.web).toBe(false)
    const statement = f.calls.find((c) => /^Write Section \d of the playbook/.test(c.id))
    expect(statement).toBeTruthy()
    // Documents are wrapped as data.
    expect(positioningCall.text).toContain(
      '<document path="memory/research/website/pages/home.md">'
    )
  })
})

describe('research service: playbook versions', () => {
  it('a full run publishes playbook v1 with seven sections; a second run publishes v2 and leaves v1 alone', async () => {
    const f = fakeProvider()
    const s = makeService(f.provider)
    await s.service.start()
    await s.until(() => s.finished.length === 1, 'first run')
    expect(s.last().status).toBe('done')
    const versions = join(ws, 'memory/positioning-playbook/versions')
    const v1Name = readdirSync(versions)[0]
    expect(v1Name).toMatch(/^Acme Rockets-v1-\d{4}-\d{2}-\d{2}\.md$/)
    const v1 = readFileSync(join(versions, v1Name), 'utf8')
    const current = matter(
      readFileSync(join(ws, 'memory/positioning-playbook/Acme Rockets.md'), 'utf8')
    )
    expect(current.data.version).toBe(1)
    expect([...current.content.matchAll(/^## Section \d: /gm)]).toHaveLength(7)
    expect(current.content).toContain('## Table of Contents')
    expect(s.last().tasks.find((t) => t.id === 'playbook-assemble')?.note).toBe('Version 1')
    // The company research file holds every step.
    const research = readFileSync(join(ws, 'memory/company-research/Acme Rockets.md'), 'utf8')
    expect(research).toContain('## Competitive Analysis')
    expect(research).not.toContain('did not run')
    // The vault config is ticked, so the skill pack's other skills see a finished vault.
    const vault = readFileSync(join(ws, 'vault.config.md'), 'utf8')
    expect(vault).toContain('- [x] Company Research')
    expect(vault).toContain('- [x] Positioning Playbook')

    await s.service.start()
    await s.until(() => s.finished.length === 2, 'second run')
    expect(readdirSync(versions)).toHaveLength(2)
    expect(readFileSync(join(versions, v1Name), 'utf8')).toBe(v1)
    expect(
      matter(readFileSync(join(ws, 'memory/positioning-playbook/Acme Rockets.md'), 'utf8')).data
        .version
    ).toBe(2)
  })
})

describe('research service: interruptions', () => {
  it('survives quitting mid-run: the next launch offers resume and skips finished tasks', async () => {
    let hold = true
    const f1 = fakeProvider({
      onCall: async (c, signal) => {
        if (hold && /^Write Section \d of the playbook/.test(c.id))
          await new Promise<void>((_r, rej) => {
            if (signal.aborted) return rej(new Error('aborted'))
            signal.addEventListener('abort', () => rej(new Error('aborted')))
          })
      }
    })
    const s1 = makeService(f1.provider)
    await s1.service.start()
    await s1.until(
      () => s1.last().tasks.some((t) => t.id.startsWith('playbook-') && t.status === 'running'),
      'playbook running'
    )
    s1.service.interrupt()
    // A group (competitor profiles) stays in progress while its children wait, so only real tasks count.
    const isGroup = (id: string) => s1.last().tasks.some((t) => t.parent === id)
    await s1.until(
      () => !s1.last().tasks.some((t) => t.status === 'running' && !isGroup(t.id)),
      'tasks to stop'
    )
    await s1.service.flush()
    const doneBefore = s1
      .last()
      .tasks.filter((t) => t.status === 'done')
      .map((t) => t.id)
    expect(doneBefore.length).toBeGreaterThan(10)
    const spent = s1.last().spentUsd

    // A new launch.
    hold = false
    const f2 = fakeProvider()
    const s2 = makeService(f2.provider)
    const restored = await s2.service.getRun()
    expect(restored?.status).toBe('paused')
    expect(restored?.pause?.reason).toBe('user')
    expect(restored?.spentUsd).toBeCloseTo(spent, 6)
    expect(
      restored?.tasks
        .filter((t) => t.status === 'done')
        .map((t) => t.id)
        .sort()
    ).toEqual(doneBefore.sort())

    await s2.service.resume()
    await s2.until(() => s2.finished.length === 1, 'finish after resume')
    expect(s2.last().status).toBe('done')
    // Only the unfinished work was asked of the model again: no step-02 call, no crawl.
    expect(f2.calls.some((c) => c.id.startsWith('Research this step'))).toBe(false)
    expect(f2.calls.length).toBeLessThan(f1.calls.length)
  })

  it('removes a finished output on disk and re-runs just that task on resume', async () => {
    const f1 = fakeProvider()
    const s1 = makeService(f1.provider)
    await s1.service.start()
    await s1.until(() => s1.finished.length === 1, 'finish')
    // Pretend the run was interrupted just before the end, and a file was deleted by hand.
    await s1.service.flush()
    const saved = (await latestRun(ws))!
    const tweaked = {
      ...saved,
      status: 'paused' as const,
      pause: { reason: 'user' as const, message: 'x' }
    }
    const { saveRun } = await import('../../src/main/research/run-store')
    await saveRun(ws, tweaked)
    const { rmSync } = await import('fs')
    rmSync(join(ws, 'memory/company-research/steps/05-strengths.md'))

    const f2 = fakeProvider()
    const s2 = makeService(f2.provider)
    const restored = await s2.service.getRun()
    expect(restored?.tasks.filter((t) => t.status === 'waiting').map((t) => t.id)).toEqual([
      'research-05-strengths'
    ])
    await s2.service.resume()
    await s2.until(() => s2.finished.length === 1, 'finish')
    expect(f2.calls).toHaveLength(1)
    expect(existsSync(join(ws, 'memory/company-research/steps/05-strengths.md'))).toBe(true)
  })

  it('cancel keeps finished outputs and stops the rest', async () => {
    const f = fakeProvider({
      onCall: async (c, signal) => {
        if (/^Write Section \d of the playbook/.test(c.id))
          await new Promise<void>((_r, rej) => {
            if (signal.aborted) return rej(new Error('aborted'))
            signal.addEventListener('abort', () => rej(new Error('aborted')))
          })
      }
    })
    const s = makeService(f.provider)
    await s.service.start()
    await s.until(
      () => s.last().tasks.some((t) => t.id.startsWith('playbook-') && t.status === 'running'),
      'playbook running'
    )
    await s.service.cancel()
    await s.until(
      () => s.finished.length === 1 && !s.last().tasks.some((t) => t.status === 'running'),
      'cancelled'
    )
    expect(s.last().status).toBe('cancelled')
    expect(existsSync(join(ws, 'memory/company-research/steps/02-product-analysis.md'))).toBe(true)
    expect(s.last().tasks.filter((t) => t.status === 'running' || t.status === 'waiting')).toEqual(
      []
    )
  })
})

describe('research service: web search and budget', () => {
  it('skips web tasks when the account cannot search, and still builds the playbook from the crawl and files', async () => {
    const f = fakeProvider({ webSearch: false })
    const s = makeService(f.provider)
    const run = await s.service.start()
    expect(run.skipWeb).toBe(true)
    await s.until(() => s.finished.length === 1, 'finish')
    const v = s.last()
    expect(f.calls.some((c) => c.web)).toBe(false)
    const skipped = v.tasks.filter((t) => t.status === 'skipped')
    expect(skipped.length).toBeGreaterThan(8)
    expect(skipped.every((t) => t.note === 'Skipped: web search unavailable')).toBe(true)
    expect(v.tasks.find((t) => t.id === 'playbook-assemble')?.status).toBe('done')
    expect(v.tasks.find((t) => t.id === 'messaging-analysis')?.status).toBe('done')
    expect(v.status).toBe('done')
  })

  it('a web-search-disabled error mid-run pauses, and resuming with skipWeb finishes the run', async () => {
    const f = fakeProvider({ failWeb: true })
    const s = makeService(f.provider)
    await s.service.start()
    await s.until(() => s.last().status === 'paused', 'pause')
    expect(s.last().pause?.reason).toBe('web_search_disabled')
    await s.service.resume({ skipWeb: true })
    await s.until(() => s.finished.length === 1, 'finish')
    expect(s.last().status).toBe('done')
    expect(s.last().skipWeb).toBe(true)
  })

  it('pauses at the budget cap and carries on when it is raised', async () => {
    const f = fakeProvider()
    const s = makeService(f.provider)
    await s.service.start({ budgetCapUsd: 0.05, concurrency: 1 })
    await s.until(() => s.last().status === 'paused', 'budget pause')
    const v = s.last()
    expect(v.pause?.reason).toBe('budget')
    expect(v.pause?.message).toMatch(/^Research has used \$\d+\.\d\d of your \$0\.05 budget\.$/)
    expect(v.spentUsd).toBeGreaterThanOrEqual(0.05)
    await s.service.resume({ budgetCapUsd: 50 })
    await s.until(() => s.finished.length === 1, 'finish')
    expect(s.last().status).toBe('done')
  })

  it('estimates cost and time before starting', async () => {
    const s = makeService(fakeProvider().provider)
    const e = await s.service.estimate()
    expect(e.costUsd.low).toBeGreaterThan(0.3)
    expect(e.costUsd.high).toBeLessThan(10)
    expect(e.costUsd.low).toBeLessThan(e.costUsd.high)
    expect(e).toMatchObject({
      model: 'claude-sonnet-5-5',
      modelKnown: true,
      webSearch: true,
      concurrency: 3,
      budgetCapUsd: 5
    })
    expect(e.tasks).toBeGreaterThan(TASKS.length)
  })

  it('refuses to start without a profile, and while a run is in progress', async () => {
    const s = makeService(fakeProvider().provider, { getKey: () => null })
    await expect(s.service.start()).rejects.toMatchObject({ code: 'no_key' })
    const s2 = makeService(fakeProvider({ onCall: () => new Promise(() => undefined) }).provider)
    await s2.service.start()
    await expect(s2.service.start()).rejects.toBeInstanceOf(ResearchError)
    s2.service.reset()
  })
})
