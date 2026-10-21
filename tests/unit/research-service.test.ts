import { spawnSync } from 'child_process'
import {
  cpSync,
  rmSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  existsSync,
  writeFileSync
} from 'fs'
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
import { writeCrawlToRaw } from '../../src/main/ingest/website-to-raw'
import { writeCrawl } from '../../src/main/ingest/write-crawl'
import { localHandlers } from '../../src/main/research/local-handlers'
import { confirmWorkspace } from '../../src/main/services/workspace'
import { stateDir } from '../../src/main/state/app-state'
import { checkWiki } from '../../src/main/wiki/conformance'
import { scanWiki } from '../../src/main/wiki/scan'
import { parseDoc } from '../../src/main/wiki/frontmatter'
import { readProvenance } from '../../src/main/state/provenance'
import type { CrawlResult } from '../../src/main/ingest/crawler'
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
import { writeProfile } from '../../src/main/workspace/profile'
import { emptyProfile } from '../../src/shared/profile'
import { parseScorecard } from '../../src/shared/scorecard'
import { fakeArticleOutput, fakeTakeawaysOutput, GOOD_ANALYSIS } from './fixtures'
import { RunViewSchema, type RunView } from '../../src/shared/research'
import { createChange, findChange, listChanges } from '../../src/main/wiki/changes'
import { planRegeneration } from '../../src/main/research/regen-plan'
import {
  editsToChange,
  keepRegeneration,
  startRegeneration,
  startTakeaways,
  takeawaysPlan
} from '../../src/main/research/regenerate'
import { assemblePlaybook } from '../../src/main/research/assemble-playbook'
import { discardJob, readJob, reviewJob } from '../../src/main/research/regen-job'
import { listHistory } from '../../src/main/state/history'
import { loadArticles } from '../../src/main/research/article-output'
import { buildPlaybookView, playbookView } from '../../src/main/wiki/playbook-view'

const root = join(__dirname, '../..')
// Skills written in later phases. Until they exist, the test stands in a stub so the whole graph can run.
const PENDING = new Set<string>([])
const disk = diskSkillReader(join(root, 'resources/skills'))
const readSkill = (skill: string, file: string): string =>
  PENDING.has(skill) && !existsSync(join(root, 'resources/skills', skill, file))
    ? file === 'SKILL.md'
      ? 'You are a stub skill for tests.'
      : ''
    : disk(skill, file)
const pricing = parsePricing(JSON.parse(readFileSync(join(root, 'resources/pricing.json'), 'utf8')))
const SECRET = 'CONFIDENTIAL-BOARD-NUMBERS-7731'
const LINT = join(root, '.cache/llm-wiki-v0.25.1/scripts/llm-wiki')
function officialLint(wiki: string): { status: number | null; out: string } | null {
  if (!existsSync(LINT)) return null
  const r = spawnSync('python3', [LINT, 'lint', '--fail-on', 'warning', wiki], { encoding: 'utf8' })
  return r.error ? null : { status: r.status, out: r.stdout }
}

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
    /** The model lists no sources in its articles. */
    noSources?: boolean
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
        let output = !a.tools.output
          ? undefined
          : a.tools.output.name === 'write_takeaways'
            ? fakeTakeawaysOutput(text)
            : fakeArticleOutput(text, call.web)
        if (opts.noSources && output) {
          const o = output as {
            articles: { sources: unknown[] }[]
            patches: { sources: unknown[] }[]
          }
          output = {
            articles: o.articles.map((x) => ({ ...x, sources: [] })),
            patches: o.patches.map((x) => ({ ...x, sources: [] }))
          }
        }
        const body = /^Write the messaging analysis/.test(instruction)
          ? GOOD_ANALYSIS
          : /most relevant competitors now/.test(instruction)
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
          output,
          sources: a.tools.webSearch
            ? [
                {
                  url: 'https://source.example/a',
                  title: 'Source A',
                  excerpts: [`Cited by ${instruction.slice(0, 20)}`],
                  cited: true
                }
              ]
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
/** The run's drafts in app state: task documents not yet in wiki format (until v2 phase 6). */
let drafts: string
const logs: string[] = []
beforeEach(async () => {
  ws = mkdtempSync(join(tmpdir(), 'phq-svc-'))
  await confirmWorkspace(ws, '0.2.0')
  drafts = join(await stateDir(ws), 'drafts')
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

const CRAWL: CrawlResult = {
  startUrl: 'https://acme.example/',
  pages: [
    {
      url: 'https://acme.example/',
      slug: 'home',
      rendered: false,
      title: 'Acme Rockets',
      description: 'Rockets for coyotes.',
      ogTitle: '',
      ogDescription: '',
      h1: ['Home'],
      h2: [],
      markdown: 'We sell rockets to coyotes.',
      wordCount: 5,
      links: [],
      social: []
    }
  ],
  social: [],
  skipped: [],
  robots: 'none'
}

const fakeLocal = (): ServiceDeps['local'] => ({
  // The real website ingest, minus the network.
  crawl: async ({ root: r, wikiRoot, sources, runId }) => {
    const pages = await writeCrawlToRaw(wikiRoot, CRAWL, '2026-10-17')
    await sources.seed(pages)
    await writeCrawl(
      r,
      CRAWL,
      runId,
      pages.map((p) => p.rel)
    )
    return { output: 'memory/research/website/index.md' }
  },
  extract: localHandlers('test').extract,
  // The real assembly step, so the test covers the playbook and its versions.
  'assemble-playbook': localHandlers('test')['assemble-playbook']
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
      const file = join(drafts, t.output)
      expect(existsSync(file), t.output).toBe(true)
      expect(matter(readFileSync(file, 'utf8')).data.status, t.output).toBe('draft')
    }

    // Every article the pipeline owns is in the wiki (spec section 6).
    const articles = (await scanWiki(ws))
      .filter((x) => x.kind === 'article')
      .map((x) => x.rel)
      .sort()
    expect(articles).toEqual(
      [
        'wiki/concepts/moat-alpha.md',
        'wiki/concepts/moat-beta.md',
        'wiki/concepts/positioning-statement.md',
        'wiki/concepts/value-driver-one.md',
        'wiki/concepts/value-driver-three.md',
        'wiki/concepts/value-driver-two.md',
        'wiki/concepts/value-drivers.md',
        'wiki/references/company-profile.md',
        'wiki/references/competitor-road-runner-inc.md',
        'wiki/references/competitor-wile-co.md',
        'wiki/references/proof-points.md',
        'wiki/references/social-taglines.md',
        'wiki/references/strengths.md',
        'wiki/references/weaknesses.md',
        'wiki/topics/company-overview.md',
        'wiki/topics/competitive-landscape.md',
        'wiki/topics/current-messaging.md',
        'wiki/topics/customer-segment.md',
        'wiki/topics/ideal-customer-profile.md',
        'wiki/topics/market-overview.md',
        'wiki/topics/market-position-summary.md',
        'wiki/topics/market-segment.md',
        'wiki/topics/product-overview.md',
        'wiki/topics/recent-developments.md'
      ].sort()
    )

    // Model output is checked and rendered by the app: no em dashes in prose, code untouched,
    // the app's own Sources section citing a raw citation record, links to missing articles as text.
    const product = parseDoc(readFileSync(join(ws, 'wiki/topics/product-overview.md'), 'utf8'))!
    const prose = product.body.replace(/```[\s\S]*?```/g, '')
    expect(prose).not.toContain('\u2014')
    expect(prose).toContain(', with a dash.')
    expect(product.body).toContain('code — stays')
    expect(product.body).not.toContain('model-written')
    expect(product.body).not.toContain('[[not-a-real-article')
    expect(product.body).toMatch(
      /## Sources\n\n- \[Source B\]\(\.\.\/\.\.\/raw\/articles\/2026-\d\d-\d\d-source-example-b\.md\)/
    )
    expect(product.data).toMatchObject({
      title: 'Product Overview',
      category: 'topic',
      volatility: 'warm',
      'compiled-from': 'sources',
      // One third-party source: clamped from the model's "high".
      confidence: 'low'
    })
    expect(Object.keys(product.data)).not.toContain('run_id')
    // Generator details live in app state instead.
    const prov = await readProvenance(ws)
    expect(prov['wiki/topics/product-overview.md']).toMatchObject({
      task: 'research-02-product',
      runId: run.id,
      model: 'claude-sonnet-5-5'
    })

    // The run file on disk is the final state.
    await s.service.flush()
    const saved = await latestRun(ws)
    expect(saved?.status).toBe('done')
    expect(saved?.spentUsd).toBeCloseTo(run.spentUsd, 6)
    expect(run.spentUsd).toBeGreaterThan(0.1)
  })

  it('ingests into raw/: own-site pages, private files and one citation record per URL, lint clean', async () => {
    const f = fakeProvider()
    const s = makeService(f.provider)
    await s.service.start()
    await s.until(() => s.finished.length === 1, 'finish')
    const raw = (await scanWiki(ws)).filter((x) => x.kind === 'raw')
    const byTag = (t: string) => raw.filter((x) => (x.data?.tags as string[]).includes(t))
    expect(byTag('own-site').map((x) => x.rel)).toEqual([
      'raw/articles/2026-10-17-acme-example-home.md'
    ])
    const priv = byTag('private')
    expect(priv.map((x) => x.rel)).toEqual([
      expect.stringMatching(/^raw\/papers\/\d{4}-\d{2}-\d{2}-board\.md$/)
    ])
    expect(priv[0].data?.tags).toEqual(['private', 'company-strategy'])
    expect(priv[0].data?.source).toBe('inbox/.processed/board.txt')
    expect(priv[0].body).toContain(SECRET)
    // Every web task cited the same URLs: one shared record per URL holding every task's excerpt.
    // Page A came from the answer's citations; page B is a source the model listed, which the
    // search really returned, so it counts too (with the model's quote).
    const cites = byTag('web-citation').sort((x, y) =>
      String(x.data?.source).localeCompare(String(y.data?.source))
    )
    expect(cites.map((c) => c.data?.source)).toEqual([
      'https://source.example/a',
      'https://source.example/b'
    ])
    expect(cites[0].body).toContain('Citation record.')
    expect(cites[1].body).toContain('"A quote from page B."')
    // Duplicate excerpts are kept once.
    const distinct = new Set(f.calls.filter((c) => c.web).map((c) => c.id.slice(0, 20))).size
    expect((cites[0].body.match(/\(cited /g) ?? []).length).toBe(distinct)
    // Nothing from the run is left in the wiki except spec files: no memory/, no .positioninghq/.
    expect(readdirSync(ws).sort()).toEqual(
      [
        'README.md',
        '_index.md',
        'config.md',
        'inbox',
        'log.md',
        'output',
        'raw',
        'schema.md',
        'wiki'
      ].sort()
    )
    const report = await checkWiki(ws)
    expect(
      report.findings.filter((x) => x.severity === 'critical' || x.severity === 'warning')
    ).toEqual([])
    // The official lint agrees (when it has been fetched: npm run wiki:lint fetches it).
    const lint = officialLint(ws)
    if (lint) expect(lint.status, lint.out).toBe(0)
    // npm run fixtures:generated writes this wiki to tests/fixtures/phq-wiki-generated (CI lints it).
    if (process.env.PHQ_WRITE_GENERATED_FIXTURE) {
      const target = join(__dirname, '../fixtures/phq-wiki-generated')
      rmSync(target, { recursive: true, force: true })
      cpSync(ws, target, { recursive: true })
    }
    expect(readFileSync(join(ws, 'log.md'), 'utf8')).toMatch(/ingest \| \d web sources cited by/)
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
    // And every call that saw it had no web tools (only the schema-only output tool, if any).
    for (const c of withSecret) {
      expect(c.tools.webSearch, c.id).toBeUndefined()
      expect(c.tools.webFetch, c.id).toBeUndefined()
    }
    // The confidential text did not leak into web-task articles on disk either.
    const rival = readFileSync(join(ws, 'wiki/references/competitor-wile-co.md'), 'utf8')
    expect(rival).not.toContain(SECRET)
    // Articles built from the private file are tagged private (spec section 8).
    const summary = parseDoc(
      readFileSync(join(ws, 'wiki/topics/market-position-summary.md'), 'utf8')
    )!
    expect(summary.data.tags).toContain('private')
  })

  it('puts the right documents in front of the right task', async () => {
    const f = fakeProvider()
    const s = makeService(f.provider)
    await s.service.start()
    await s.until(() => s.finished.length === 1, 'finish')
    const positioningCall = f.calls.find((c) =>
      c.id.startsWith('Write the current-messaging article')
    )!
    expect(positioningCall.text).toContain('We sell rockets to coyotes.')
    expect(positioningCall.web).toBe(false)
    const statement = f.calls.find((c) => /^Write the wiki articles for Section 5/.test(c.id))!
    // Tasks shown the competitor profiles see every competitor's article.
    for (const prefix of [
      'Write the competitive analysis',
      'Write the wiki articles for Section 6'
    ]) {
      const c = f.calls.find((x) => x.id.startsWith(prefix))!
      expect(c.text, prefix).toContain('<document path="wiki/references/competitor-wile-co.md">')
      expect(c.text, prefix).toContain(
        '<document path="wiki/references/competitor-road-runner-inc.md">'
      )
    }
    // Article inputs are shown by their wiki paths.
    expect(statement.text).toContain('<document path="wiki/concepts/value-drivers.md">')
    expect(statement).toBeTruthy()
    // Documents are wrapped as data.
    expect(positioningCall.text).toContain(
      '<document path="raw/articles/2026-10-17-acme-example-home.md">'
    )
  })
})

describe('research service: sources', () => {
  it('cites what a task really used when the model lists no sources', async () => {
    const f = fakeProvider({ noSources: true })
    const s = makeService(f.provider)
    await s.service.start()
    await s.until(() => s.finished.length === 1, 'finish')
    expect(s.last().status).toBe('done')
    // A web task: the page its answer cited.
    const product = parseDoc(readFileSync(join(ws, 'wiki/topics/product-overview.md'), 'utf8'))!
    expect(product.data.sources).toEqual([
      expect.stringMatching(/^raw\/articles\/\d{4}-\d{2}-\d{2}-source-example-a\.md$/)
    ])
    expect(product.data['compiled-from']).toBe('sources')
    // A synthesis task: the raw files behind the documents it was given.
    const messaging = parseDoc(readFileSync(join(ws, 'wiki/topics/current-messaging.md'), 'utf8'))!
    expect(messaging.data.sources).toEqual(['raw/articles/2026-10-17-acme-example-home.md'])
  })
})

describe('research service: social taglines', () => {
  it('finds profiles after the crawl, from its index, and writes a table the app can read', async () => {
    const f = fakeProvider()
    const s = makeService(f.provider)
    await s.service.start()
    await s.until(() => s.finished.length === 1, 'finish')
    const find = f.calls.find((c) => c.id.startsWith('List the company social profiles'))!
    // The crawl was done first, and only its index was shown to this web task.
    expect(find.text).toContain('<document path="memory/research/website/index.md">')
    expect(find.text).not.toContain('We sell rockets to coyotes.')
    const { parseSocialTable } = await import('../../src/shared/social')
    const article = readFileSync(join(ws, 'wiki/references/social-taglines.md'), 'utf8')
    const rows = parseSocialTable(article)
    // Each profile found is a raw note, and the article cites it.
    const notes = (await scanWiki(ws)).filter((x) => x.dir === 'raw/notes')
    expect(notes.map((x) => x.data?.source)).toEqual(['https://linkedin.com/company/acme'])
    expect(notes[0].data?.tags).toEqual(['social', 'linkedin'])
    expect(article).toContain(notes[0].rel)
    expect(rows.map((r) => [r.network, r.found])).toEqual([
      ['LinkedIn', true],
      ['X', false]
    ])
    expect(s.last().tasks.find((t) => t.id === 'social-taglines')?.note).toBeNull()
  })
})

describe('research service: messaging analysis', () => {
  it('runs last, on the playbook, website and taglines, with no web tools, and writes a readable scorecard', async () => {
    const f = fakeProvider()
    const s = makeService(f.provider)
    await s.service.start()
    await s.until(() => s.finished.length === 1, 'finish')
    const call = f.calls.find((c) => c.id.startsWith('Write the messaging analysis'))!
    expect(call.tools).toEqual({})
    expect(call.text).toContain('<document path="wiki/concepts/positioning-statement.md">')
    expect(call.text).toContain('<document path="wiki/topics/current-messaging.md">')
    expect(call.text).toContain('<document path="wiki/references/social-taglines.md">')
    expect(call.text).toContain('Score each dimension from 1 to 5')
    const out = (await scanWiki(ws)).filter(
      (x) => x.kind === 'output' && x.name.startsWith('messaging-analysis-')
    )
    expect(out.map((x) => x.name)).toEqual([
      expect.stringMatching(/^messaging-analysis-v1-\d{4}-\d{2}-\d{2}$/)
    ])
    const doc = readFileSync(join(ws, out[0].rel), 'utf8')
    expect(parseScorecard(doc)).toHaveLength(5)
    expect(out[0].data).toMatchObject({
      type: 'report',
      title: 'Messaging Analysis: Acme Rockets (v1)'
    })
    expect(out[0].data?.sources).toContain('wiki/topics/current-messaging.md')
    expect(s.last().tasks.find((t) => t.id === 'messaging-analysis')?.note).toBeNull()
    // Nothing failed or was blocked: the whole pipeline now has real skills.
    expect(s.last().status).toBe('done')
  })
})

describe('research service: playbook versions', () => {
  it('a full run publishes playbook v1 with seven sections; a second run publishes v2 and leaves v1 alone', async () => {
    const f = fakeProvider()
    const s = makeService(f.provider)
    await s.service.start()
    await s.until(() => s.finished.length === 1, 'first run')
    expect(s.last().status).toBe('done')
    const versions = join(ws, 'output')
    const playbooks = () =>
      readdirSync(versions)
        .filter((n) => n.startsWith('positioning-playbook-'))
        .sort()
    const v1Name = playbooks()[0]
    expect(v1Name).toMatch(/^positioning-playbook-v1-\d{4}-\d{2}-\d{2}\.md$/)
    const v1 = readFileSync(join(versions, v1Name), 'utf8')
    const current = parseDoc(v1)!
    expect(current.data.title).toBe('Positioning Playbook: Acme Rockets (v1)')
    expect([...current.body.matchAll(/^## Section \d: /gm)]).toHaveLength(7)
    expect(current.body).toContain('## Table of Contents')
    expect(current.body).toContain('### Value Driver: One')
    expect(current.data.sources).toContain('wiki/concepts/positioning-statement.md')
    expect(s.last().tasks.find((t) => t.id === 'playbook-assemble')?.note).toBe('Version 1')
    // Key takeaways for all seven sections, gaps only where the model found a weakness
    // (REQUIREMENTS-v4 7.3), with no em dashes.
    const view = buildPlaybookView({
      path: `output/${v1Name}`,
      text: v1,
      articles: await loadArticles(ws),
      changes: [],
      scores: null,
      current: true,
      company: 'Acme Rockets'
    })
    expect(view.sections.map((x) => x.takeaways?.length)).toEqual([3, 3, 3, 3, 3, 3, 3])
    expect(view.sections.filter((x) => x.gap).map((x) => x.id)).toEqual(['advantages', 'proof'])
    expect(view.needsTakeaways).toBe(false)
    expect(view.sections[0].takeaways?.[0]).toBe('market-overview buyers want speed, not suites.')
    const icp = readFileSync(join(ws, 'wiki/topics/ideal-customer-profile.md'), 'utf8')
    expect(icp).toMatch(/> The point of[^\n]*\n\n## Key takeaways\n\n1\. /)
    expect(icp).toContain('1. ideal-customer-profile buyers want speed, not suites.')
    const lint = officialLint(ws)
    if (lint) expect(lint.status, lint.out).toBe(0)

    await s.service.start()
    await s.until(() => s.finished.length === 2, 'second run')
    expect(playbooks()).toHaveLength(2)
    expect(readFileSync(join(versions, v1Name), 'utf8')).toBe(v1)
    expect(playbooks()[1]).toMatch(/^positioning-playbook-v2-/)
  })
})

describe('research service: re-running', () => {
  it('regenerates the playbook (v2) and the messaging analysis without redoing the research', async () => {
    const f1 = fakeProvider()
    const s = makeService(f1.provider)
    await s.service.start()
    await s.until(() => s.finished.length === 1, 'first run')
    const research = readFileSync(join(ws, 'wiki/topics/product-overview.md'), 'utf8')
    const callsBefore = f1.calls.length

    const run = await s.service.rerun({ preset: 'playbook' })
    expect(run.scope).toContain('playbook-assemble')
    await s.until(() => s.finished.length === 2, 'regenerate')
    expect(s.last().status).toBe('done')
    const newCalls = f1.calls.slice(callsBefore).map((c) => c.id)
    // Seven sections and the messaging analysis, and nothing from the research stages.
    expect(newCalls.filter((c) => /^Write the wiki articles for Section/.test(c))).toHaveLength(7)
    expect(newCalls.filter((c) => c.startsWith('Write the messaging analysis'))).toHaveLength(1)
    expect(newCalls).toHaveLength(8)
    expect(readFileSync(join(ws, 'wiki/topics/product-overview.md'), 'utf8')).toBe(research)
    expect(
      readdirSync(join(ws, 'output')).filter((n) => n.startsWith('positioning-playbook-'))
    ).toHaveLength(2)
  })

  it('re-runs one task, and a competitor profile re-runs the profiles', async () => {
    const f = fakeProvider()
    const s = makeService(f.provider)
    await s.service.start()
    await s.until(() => s.finished.length === 1, 'first run')
    const before = f.calls.length
    await s.service.rerun({ taskIds: ['research-05-strengths'] })
    await s.until(() => s.finished.length === 2, 'single re-run')
    expect(f.calls.slice(before)).toHaveLength(1)
    const run = await s.service.rerun({ taskIds: ['competitor-profiles:wile-co'] })
    expect(run.scope).toEqual(['competitor-profiles'])
    await s.until(() => s.finished.length === 3, 'profiles re-run')
    expect(s.last().tasks.filter((t) => t.parent === 'competitor-profiles')).toHaveLength(2)
    await expect(s.service.rerun({ taskIds: ['nope'] })).rejects.toMatchObject({
      code: 'invalid_payload'
    })
  })

  it('lists every output in the catalog, including the assembled research', async () => {
    const s = makeService(fakeProvider().provider)
    const cat = await s.service.catalog()
    expect(cat.find((c) => c.taskId === 'proof-gathering')?.path).toBe(
      'memory/research/proof-public.md'
    )
    expect(cat.find((c) => c.taskId === 'competitor-profiles')?.path).toBe(
      'memory/receipts/competitor-profiles'
    )
  })
})

describe('research service: choosing steps (REQUIREMENTS-v4.4 4A)', () => {
  const state = async (s: ReturnType<typeof makeService>, id: string) =>
    (await s.service.taskStates()).find((t) => t.id === id)!

  it('lists every step as not run, with what it needs, and runs one step alone', async () => {
    const f = fakeProvider()
    const s = makeService(f.provider)
    const states = await s.service.taskStates()
    expect(states.map((t) => t.id)).not.toContain('playbook-takeaways')
    expect(states.every((t) => t.status === 'not-run' && t.description)).toBe(true)
    expect(states.find((t) => t.id === 'competitor-profiles')?.dependsOn).toEqual([
      'competitor-discovery'
    ])
    expect(states.find((t) => t.id === 'research-05-strengths')!.costUsd.high).toBeGreaterThan(0)

    await expect(s.service.runTasks(['competitor-profiles'])).rejects.toMatchObject({
      code: 'invalid_payload',
      message: 'Profile competitors needs Find competitors first.'
    })

    const run = await s.service.runTasks(['research-05-strengths'], { budgetCapUsd: 2 })
    expect(run.scope).toEqual(['research-05-strengths'])
    expect(run.budgetCapUsd).toBe(2)
    await s.until(() => s.finished.length === 1, 'one step')
    expect(f.calls).toHaveLength(1)
    const done = await state(s, 'research-05-strengths')
    expect(done.status).toBe('done')
    expect(done.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(done.open).toMatch(/^wiki\//)
    // It writes wiki articles: changed only through Regenerate.
    expect(done.regenerate).toBeTruthy()
    expect(done.rerunnable).toBe(false)
    await expect(s.service.runTasks(['research-05-strengths'])).rejects.toMatchObject({
      message: 'Strengths already has output. Use Regenerate to change it.'
    })
    expect((await state(s, 'research-06-weaknesses')).status).toBe('not-run')
  })

  it('a step and what it needs can run together, and the rest come later', async () => {
    const s = makeService(fakeProvider().provider)
    await s.service.runTasks(['competitor-discovery', 'competitor-profiles'])
    await s.until(() => s.finished.length === 1, 'discovery and profiles')
    expect(s.last().status).toBe('done')
    expect((await state(s, 'competitor-discovery')).status).toBe('done')
    // Drafts only: it can run again.
    expect((await state(s, 'competitor-discovery')).rerunnable).toBe(true)
    const profiles = await state(s, 'competitor-profiles')
    expect(profiles.status).toBe('done')
    expect(profiles.open).toMatch(/^wiki\/references\/competitor-/)
    // Its dependency now has output, so the next step can run on its own.
    const run = await s.service.runTasks(['proof-gathering'])
    expect(run.scope).toEqual(['proof-gathering'])
    await s.until(() => s.finished.length === 2, 'proof')
    expect((await state(s, 'proof-gathering')).status).toBe('done')
  })

  it('adds steps to the run that is going', async () => {
    let hold = true
    const f = fakeProvider({
      onCall: async () => {
        while (hold) await new Promise((r) => setTimeout(r, 2))
      }
    })
    const s = makeService(f.provider)
    const first = await s.service.runTasks(['research-05-strengths'])
    await s.until(() => s.last().tasks.some((t) => t.status === 'running'), 'running')
    const joined = await s.service.runTasks(['research-06-weaknesses', 'research-05-strengths'])
    expect(joined.id).toBe(first.id)
    expect(joined.scope).toEqual(['research-05-strengths', 'research-06-weaknesses'])
    expect(joined.tasks.map((t) => t.id)).toEqual([
      'research-05-strengths',
      'research-06-weaknesses'
    ])
    hold = false
    await s.until(() => s.finished.length === 1, 'both')
    expect(s.last().tasks.every((t) => t.status === 'done')).toBe(true)
    expect(f.calls).toHaveLength(2)
  })

  it('a step skipped for no web search counts as ready; a failed step says why', async () => {
    const s = makeService(fakeProvider({ webSearch: false }).provider)
    await s.service.runTasks(['competitor-discovery'])
    await s.until(() => s.finished.length === 1, 'skipped')
    const skipped = await state(s, 'competitor-discovery')
    expect(skipped.status).toBe('skipped')
    expect(skipped.note).toMatch(/web search/)
    expect(
      (await s.service.taskStates()).find((t) => t.id === 'proof-gathering')!.dependsOn
    ).toEqual(['competitor-discovery'])

    const failing = makeService(
      fakeProvider({
        onCall: () => {
          throw new ProviderError('unknown')
        }
      }).provider
    )
    await failing.service.runTasks(['research-06-weaknesses'])
    await failing.until(() => failing.finished.length === 1, 'failed')
    const failed = await state(failing, 'research-06-weaknesses')
    expect(failed.status).toBe('failed')
    expect(failed.note).toBeTruthy()
    // A failed step can be run again.
    await expect(failing.service.runTasks(['research-06-weaknesses'])).resolves.toBeTruthy()
  })
})

describe('research service: playbook ready (REQUIREMENTS-v4.4 3.1)', () => {
  it('fires once when the playbook is published, before the messaging analysis finishes', async () => {
    const ready: RunView[] = []
    const s = makeService(fakeProvider().provider, { onPlaybookReady: (r) => void ready.push(r) })
    await s.service.start()
    await s.until(() => s.finished.length === 1, 'full run')
    expect(ready).toHaveLength(1)
    expect(ready[0].kind).toBe('full')
    const at = ready[0].playbookReadyAt!
    expect(at).toBeGreaterThan(0)
    expect(ready[0].tasks.find((t) => t.id === 'messaging-analysis')!.status).not.toBe('done')
    const end = s.last()
    expect(end.playbookReadyAt).toBe(at)
    expect(end.tasks.find((t) => t.id === 'messaging-analysis')!.endedAt!).toBeGreaterThanOrEqual(
      at
    )
    expect(end.doneSeenAt).toBeNull()

    const stats = (await s.service.doneStats(end.id))!
    expect(stats).toMatchObject({
      company: 'Acme Rockets',
      version: 1,
      sections: 7,
      competitors: 2,
      unfinished: [],
      messagingRunning: false
    })
    expect(stats.sources).toBeGreaterThan(0)
    expect(stats.minutes).toBeGreaterThanOrEqual(1)

    // Seen, saved, and still seen after a restart.
    await s.service.markDoneSeen(end.id)
    await s.service.flush()
    expect((await latestRun(ws))!.doneSeenAt).toBeGreaterThan(0)
    const again = makeService(fakeProvider().provider)
    expect((await again.service.getRun())!.doneSeenAt).toBeGreaterThan(0)
  })

  it('a run of chosen steps without publishing never fires; the playbook preset does', async () => {
    const ready: RunView[] = []
    const s = makeService(fakeProvider().provider, { onPlaybookReady: (r) => void ready.push(r) })
    const run = await s.service.runTasks(['research-05-strengths'])
    expect(run.kind).toBe('selected')
    await s.until(() => s.finished.length === 1, 'one step')
    expect(ready).toHaveLength(0)
    expect(s.last().playbookReadyAt).toBeNull()
    // No playbook yet: the stats say so instead of failing.
    expect(await s.service.doneStats(run.id)).toMatchObject({
      version: null,
      sections: 0,
      sources: 0,
      biggestGap: null
    })

    await s.service.start()
    await s.until(() => s.finished.length === 2, 'full run')
    const playbook = await s.service.rerun({ preset: 'playbook' })
    expect(playbook.kind).toBe('playbook')
    await s.until(() => s.finished.length === 3, 'playbook preset')
    expect(ready.map((r) => r.kind)).toEqual(['full', 'playbook'])
  })

  it('reads run files written before v4.4', () => {
    const old = {
      id: 'r',
      status: 'done',
      pause: null,
      model: 'm',
      concurrency: 3,
      budgetCapUsd: 5,
      spentUsd: 1,
      skipWeb: false,
      startedAt: 1,
      endedAt: 2,
      tasks: []
    }
    expect(RunViewSchema.parse(old)).toMatchObject({
      kind: 'full',
      playbookReadyAt: null,
      doneSeenAt: null,
      scope: null
    })
  })
})

describe('research service: interruptions', () => {
  it('survives quitting mid-run: the next launch offers resume and skips finished tasks', async () => {
    let hold = true
    const f1 = fakeProvider({
      onCall: async (c, signal) => {
        if (hold && /^Write the wiki articles for Section/.test(c.id))
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
    rmSync(join(ws, 'wiki/references/strengths.md'))

    const f2 = fakeProvider()
    const s2 = makeService(f2.provider)
    const restored = await s2.service.getRun()
    expect(restored?.tasks.filter((t) => t.status === 'waiting').map((t) => t.id)).toEqual([
      'research-05-strengths'
    ])
    await s2.service.resume()
    await s2.until(() => s2.finished.length === 1, 'finish')
    expect(f2.calls).toHaveLength(1)
    expect(existsSync(join(ws, 'wiki/references/strengths.md'))).toBe(true)
  })

  it('cancel keeps finished outputs and stops the rest', async () => {
    const f = fakeProvider({
      onCall: async (c, signal) => {
        if (/^Write the wiki articles for Section/.test(c.id))
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
    expect(existsSync(join(ws, 'wiki/topics/product-overview.md'))).toBe(true)
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

describe('research service: active state', () => {
  it('is active while a run is going and not once it is cancelled', async () => {
    const s = makeService(fakeProvider({ onCall: () => new Promise(() => undefined) }).provider)
    expect(s.service.isActive()).toBe(false)
    await s.service.start()
    expect(s.service.isActive()).toBe(true)
    await s.service.cancel()
    expect(s.service.isActive()).toBe(false)
  })
})

describe('regeneration with changes (REQUIREMENTS-v3.1 4, 5)', () => {
  const ICP = 'wiki/topics/ideal-customer-profile.md'
  const read = (rel: string): string => readFileSync(join(ws, rel), 'utf8')

  async function fullRun(f = fakeProvider()) {
    const s = makeService(f.provider)
    await s.service.start()
    await s.until(() => s.finished.length === 1, 'first run')
    return { f, s }
  }
  const change = (more: Partial<Parameters<typeof createChange>[1]> = {}) =>
    createChange(ws, {
      page: 'ideal-customer-profile',
      section: 'Details',
      quote: '',
      why: 'Our buyers are heads of sales.',
      changeTo: 'Lead with heads of sales. Founders are secondary.',
      basedOn: [],
      notes: '',
      affects: [],
      ...more
    })

  it('previews without spending, stages the result, and keeps it: changes applied, wiki updated', async () => {
    const { f, s } = await fullRun()
    const c = await change({ notes: `Call notes. ${SECRET}` })
    const callsBefore = f.calls.length
    const plan = (await planRegeneration(ws, 'ideal-customer-profile', s.service.planDeps()))!
    expect(f.calls.length).toBe(callsBefore)
    expect(plan.taskId).toBe('playbook-02-icp')
    expect(plan.pending.map((x) => x.id)).toEqual([c.id])
    expect(plan.estimate.base.costUsd.high).toBeGreaterThan(0)
    expect(plan.dependents.map((x) => x.slug)).toContain('positioning-statement')
    expect(plan.reassemblesPlaybook).toBe(true)

    const before = read(ICP)
    await startRegeneration(s.service, ws, {
      page: 'ideal-customer-profile',
      changeIds: [c.id],
      refreshWeb: false,
      queue: []
    })
    await s.until(() => s.finished.length === 2, 'regeneration')
    // One call, no web tools, told what to apply, shown the current page and the private notes.
    const regen = f.calls.slice(callsBefore)
    expect(regen).toHaveLength(1)
    expect(regen[0].web).toBe(false)
    expect(regen[0].text).toContain('Changes the founder asked for')
    expect(regen[0].text).toContain('Change it to: Lead with heads of sales')
    expect(regen[0].text).toContain('Current version of this page')
    expect(regen[0].text).toContain(SECRET)

    // Staged, not written.
    expect(read(ICP)).toBe(before)
    const review = (await reviewJob(ws))!
    expect(review.job.status).toBe('review')
    expect(review.files.map((x) => x.rel)).toEqual([ICP])
    expect(review.files[0].before).toBe(before)
    expect(review.job.report).toEqual([
      { id: c.id, name: c.name, applied: 'yes', note: 'Applied in the Details section (C1).' }
    ])

    const kept = await keepRegeneration(s.service, ws, 'claude-sonnet-5-5')
    expect(kept).toMatchObject({ written: [ICP], applied: [c.id], notApplied: [], next: null })
    expect(read(ICP)).toBe(review.files[0].after)
    expect((await findChange(ws, c.id))!).toMatchObject({
      status: 'applied',
      statusRef: 'ideal-customer-profile'
    })
    expect(read('log.md')).toMatch(/regenerate \| Ideal Customer Profile applying 1 change/)
    expect((await readProvenance(ws))[ICP].runId).toBe(review.job.runId)
    expect((await listHistory(ws))[0].changes).toEqual([c.id])
    // The private notes made the page private.
    expect(read(ICP)).toMatch(/^tags: .*private/m)
    const lint = officialLint(ws)
    if (lint) expect(lint.status, lint.out).toBe(0)
  })

  it('discard leaves the wiki as it was and the change waiting', async () => {
    const { s } = await fullRun()
    const c = await change()
    const before = read(ICP)
    await startRegeneration(s.service, ws, {
      page: 'ideal-customer-profile',
      changeIds: [c.id],
      refreshWeb: false,
      queue: []
    })
    await s.until(() => s.finished.length === 2, 'regeneration')
    await discardJob(ws)
    expect(read(ICP)).toBe(before)
    expect((await findChange(ws, c.id))!.status).toBe('pending')
    expect((await readJob(ws))!.status).toBe('discarded')
    const lint = officialLint(ws)
    if (lint) expect(lint.status, lint.out).toBe(0)
  })

  it('keeps a change the model could not apply waiting, and says so', async () => {
    const { s } = await fullRun()
    const c = await change({ changeTo: 'NOT-POSSIBLE: name a customer we do not have.' })
    await startRegeneration(s.service, ws, {
      page: 'ideal-customer-profile',
      changeIds: [c.id],
      refreshWeb: false,
      queue: []
    })
    await s.until(() => s.finished.length === 2, 'regeneration')
    const kept = await keepRegeneration(s.service, ws, 'claude-sonnet-5-5')
    expect(kept.notApplied).toEqual([c.name])
    expect((await findChange(ws, c.id))!.status).toBe('pending')
  })

  it('a later full run respects an applied change (it reaches the prompt as a decision)', async () => {
    const { f, s } = await fullRun()
    const c = await change()
    await startRegeneration(s.service, ws, {
      page: 'ideal-customer-profile',
      changeIds: [c.id],
      refreshWeb: false,
      queue: []
    })
    await s.until(() => s.finished.length === 2, 'regeneration')
    await keepRegeneration(s.service, ws, 'claude-sonnet-5-5')
    const n = f.calls.length
    await s.service.start()
    await s.until(() => s.finished.length === 3, 'second full run')
    const icpCall = f.calls.slice(n).find((x) => x.text.includes('ideal-customer-profile (topic)'))!
    expect(icpCall.text).toContain('Decisions the founder made')
    expect(icpCall.text).toContain('Lead with heads of sales')
    // Waiting changes are not respected by a normal run.
    const waiting = await change({ changeTo: 'Something still waiting.' })
    const m = f.calls.length
    await s.service.rerun({ taskIds: ['playbook-02-icp'] })
    await s.until(() => s.finished.length === 4, 'rerun')
    expect(f.calls.slice(m)[0].text).not.toContain('Something still waiting')
    expect((await listChanges(ws)).find((x) => x.id === waiting.id)!.status).toBe('pending')
  })

  it('never sends a private Based on file to a web call, and regenerates only that competitor', async () => {
    const { f, s } = await fullRun()
    const c = await createChange(ws, {
      page: 'competitor-wile-co',
      section: null,
      quote: '',
      why: 'They dropped their free plan.',
      changeTo: 'Say they have no free plan.',
      basedOn: [],
      notes: `Sales call. ${SECRET}`,
      affects: []
    })
    const n = f.calls.length
    await startRegeneration(s.service, ws, {
      page: 'competitor-wile-co',
      changeIds: [c.id],
      refreshWeb: true,
      queue: []
    })
    await s.until(() => s.finished.length === 2, 'competitor regeneration')
    const calls = f.calls.slice(n)
    expect(calls).toHaveLength(1)
    expect(calls[0].web).toBe(false)
    expect(calls[0].text).toContain(SECRET)
    expect(f.calls.filter((x) => x.web).some((x) => x.text.includes(SECRET))).toBe(false)
    const review = (await reviewJob(ws))!
    expect(review.files.map((x) => x.rel)).toEqual(['wiki/references/competitor-wile-co.md'])
  })

  it('an interrupted regeneration is not offered for resume and never writes the wiki', async () => {
    const f = fakeProvider()
    const { s } = await fullRun(f)
    const c = await change()
    const before = read(ICP)
    let hold = true
    const held = fakeProvider({
      onCall: async (_c, signal) => {
        if (hold)
          await new Promise<void>((_r, rej) => {
            if (signal.aborted) return rej(new Error('aborted'))
            signal.addEventListener('abort', () => rej(new Error('aborted')))
          })
      }
    })
    const s1 = makeService(held.provider)
    await startRegeneration(s1.service, ws, {
      page: 'ideal-customer-profile',
      changeIds: [c.id],
      refreshWeb: false,
      queue: []
    })
    await s1.until(() => s1.last()?.tasks.some((t) => t.status === 'running') ?? false, 'running')
    s1.service.interrupt()
    await s1.until(() => !s1.last().tasks.some((t) => t.status === 'running'), 'stopped')
    await s1.service.flush()
    hold = false
    // A new launch.
    const s2 = makeService(fakeProvider().provider)
    const run = await s2.service.getRun()
    expect(run?.status).toBe('cancelled')
    expect((await readJob(ws))!.status).toBe('failed')
    expect(read(ICP)).toBe(before)
    expect((await findChange(ws, c.id))!.status).toBe('pending')
    void s
  })

  it('spots an outside edit and turns it into a waiting change', async () => {
    const { s } = await fullRun()
    const text = read(ICP)
    writeFileSync(join(ws, ICP), text.replace('## Details', '## Details\n\nOur own sentence.'))
    const plan = (await planRegeneration(ws, 'ideal-customer-profile', s.service.planDeps()))!
    expect(plan.outsideEdit).toEqual({ edited: true, canDescribe: true })
    const c = await editsToChange(ws, 'ideal-customer-profile')
    expect(c.status).toBe('pending')
    expect(c.changeTo).toContain('Added: Our own sentence.')
  })
})

describe('research service: adding key takeaways to an older playbook (REQUIREMENTS-v4 7.3)', () => {
  /** A wiki from before v4: a full run, then the takeaways and gaps taken out again. */
  async function olderWiki(s: ReturnType<typeof makeService>): Promise<void> {
    await s.service.start()
    await s.until(() => s.finished.length === 1, 'first run')
    for (const f of await scanWiki(ws)) {
      if (f.kind !== 'article') continue
      const full = join(ws, f.rel)
      const text = readFileSync(full, 'utf8')
      writeFileSync(
        full,
        text
          .replace(/## Key takeaways\n\n(?:\d\. .*\n)+\n/, '')
          .replace(/## Gap to close\n\n(?:\*\*.*\n\n?)+/, '')
      )
    }
    rmSync(join(await stateDir(ws), 'playbook-extras.json'), { force: true })
    await assemblePlaybook(ws, 'Acme Rockets', '2026-10-19')
  }

  const view = async () => (await playbookView(ws, null, 'Acme Rockets'))!

  it('previews for free, stages the takeaways for review, and keeps them without touching other text', async () => {
    const f = fakeProvider()
    const s = makeService(f.provider)
    await olderWiki(s)
    expect((await view()).needsTakeaways).toBe(true)
    const icpBefore = readFileSync(join(ws, 'wiki/topics/ideal-customer-profile.md'), 'utf8')
    expect(icpBefore).not.toContain('## Key takeaways')

    const calls = f.calls.length
    const plan = (await takeawaysPlan(ws, s.service.planDeps()))!
    expect(f.calls.length).toBe(calls)
    expect(plan.pages.map((p) => p.slug)).toEqual([
      'market-overview',
      'ideal-customer-profile',
      'value-drivers',
      'positioning-statement',
      'competitive-landscape',
      'proof-points'
    ])
    expect(plan.advantages).toBe(true)
    expect(plan.estimate.costUsd.high).toBeGreaterThan(0)

    await startTakeaways(s.service, ws)
    await s.until(() => s.finished.length === 2, 'takeaways run')
    // One call, no web tools, nothing written to the wiki yet.
    const call = f.calls.slice(calls)
    expect(call).toHaveLength(1)
    expect(call[0].web).toBe(false)
    expect(call[0].tools.output?.name).toBe('write_takeaways')
    expect(readFileSync(join(ws, 'wiki/topics/ideal-customer-profile.md'), 'utf8')).toBe(icpBefore)
    await s.until(() => s.service.isActive() === false, 'idle')
    const review = (await reviewJob(ws))!
    expect(review.files.map((x) => x.title)).toContain('Distinct Advantages (playbook only)')
    expect(review.files).toHaveLength(7)

    const kept = await keepRegeneration(s.service, ws, 'claude-sonnet-5-5')
    expect(kept.written.some((p) => p.startsWith('output/positioning-playbook-v'))).toBe(true)
    const icpAfter = readFileSync(join(ws, 'wiki/topics/ideal-customer-profile.md'), 'utf8')
    expect(icpAfter).toContain(
      '## Key takeaways\n\n1. Backfilled ideal-customer-profile line one.\n2. Backfilled line two, short.\n3. Backfilled line three.'
    )
    // Only the two sections (and the updated date) change.
    const strip = (t: string) =>
      t
        .replace(/^updated: .*$/m, '')
        .replace(/## Key takeaways\n\n(?:\d\. .*\n)+\n/, '')
        .replace(/## Gap to close\n\n(?:\*\*.*\n\n?)+/, '')
    expect(strip(icpAfter)).toBe(strip(icpBefore))
    const v = await view()
    expect(v.needsTakeaways).toBe(false)
    expect(v.sections.map((x) => x.takeaways?.length)).toEqual([3, 3, 3, 3, 3, 3, 3])
    expect(v.sections.filter((x) => x.gap).map((x) => x.id)).toEqual(['proof'])
    expect(readFileSync(join(ws, 'log.md'), 'utf8')).toContain(
      'regenerate | key takeaways and gaps added to 6 pages'
    )
    const lint = officialLint(ws)
    if (lint) expect(lint.status, lint.out).toBe(0)
  })

  it('discard leaves the wiki and the stored takeaways as they were', async () => {
    const f = fakeProvider()
    const s = makeService(f.provider)
    await olderWiki(s)
    const before = new Map(
      (await scanWiki(ws)).map((x) => [x.rel, readFileSync(join(ws, x.rel), 'utf8')])
    )
    await startTakeaways(s.service, ws)
    await s.until(() => s.finished.length === 2, 'takeaways run')
    await s.until(() => s.service.isActive() === false, 'idle')
    await discardJob(ws)
    for (const [rel, text] of before) expect(readFileSync(join(ws, rel), 'utf8'), rel).toBe(text)
    expect(existsSync(join(await stateDir(ws), 'playbook-extras.json'))).toBe(false)
    expect((await view()).needsTakeaways).toBe(true)
  })
})
