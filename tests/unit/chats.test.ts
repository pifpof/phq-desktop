import { existsSync, mkdtempSync, readdirSync, writeFileSync, mkdirSync } from 'fs'
import { stateDir } from '../../src/main/state/app-state'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { chatTitle, type ChatRecord } from '../../src/shared/chat'
import {
  deleteChat,
  getChat,
  listChats,
  renameChat,
  saveChat
} from '../../src/main/workspace/chats'
import {
  MAX_QUESTION_ARTICLES,
  scoreArticle,
  workspaceContext
} from '../../src/main/modes/workspace'
import { generalPrompt } from '../../src/main/modes/general'

const chat = (id: string, updatedAt: number): ChatRecord => ({
  id,
  title: 'What is our positioning?',
  modeId: 'workspace',
  createdAt: 1,
  updatedAt,
  messages: [
    { role: 'user', content: 'What is our positioning?' },
    { role: 'assistant', content: 'X', status: 'done', usage: { inputTokens: 5, outputTokens: 1 } }
  ]
})
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('saved chats', () => {
  it('saves, lists newest first, renames and deletes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'phq-chats-'))
    await saveChat(root, chat(A, 100))
    await saveChat(root, chat(B, 200))
    expect((await listChats(root)).map((c) => c.id)).toEqual([B, A])
    expect(await getChat(root, A)).toEqual(chat(A, 100))
    expect(await renameChat(root, A, '  Renamed  ')).toBe(true)
    expect((await getChat(root, A))?.title).toBe('Renamed')
    await deleteChat(root, A)
    expect((await listChats(root)).map((c) => c.id)).toEqual([B])
    expect(readdirSync(join(await stateDir(root), 'chats'))).toEqual([`${B}.json`])
    expect(existsSync(join(root, '.positioninghq'))).toBe(false)
  })

  it('refuses IDs that are not chat IDs, so nothing outside the chats folder is touched', async () => {
    const root = mkdtempSync(join(tmpdir(), 'phq-chats-'))
    expect(await getChat(root, '../../profile')).toBeNull()
    await expect(saveChat(root, { ...chat(A, 1), id: '../x' })).rejects.toThrow()
    await expect(deleteChat(root, '../../settings')).rejects.toThrow()
  })

  it('ignores corrupt chat files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'phq-chats-'))
    const dir = join(await stateDir(root), 'chats')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${A}.json`), '{nope')
    expect(await listChats(root)).toEqual([])
  })

  it('titles a chat by its first question', () => {
    expect(chatTitle('  What   is our positioning? ')).toBe('What is our positioning?')
    expect(chatTitle('x'.repeat(100))).toHaveLength(60)
    expect(chatTitle('')).toBe('New chat')
  })
})

describe('workspace chat mode (index-first)', () => {
  const FIXTURE = join(__dirname, '../fixtures/phq-wiki-generated')
  const ask = (q: string) => [{ role: 'user' as const, content: q }]
  const text = (sys: unknown): string => (sys as { text: string }[]).map((b) => b.text).join('\n')

  it('falls back to the general prompt until research has written articles', async () => {
    expect((await workspaceContext({ root: null })).system).toBe(generalPrompt)
    expect((await workspaceContext({ root: mkdtempSync(join(tmpdir(), 'phq-ws-')) })).system).toBe(
      generalPrompt
    )
  })

  it('always loads the README rules, the master index and the Start here articles, cached', async () => {
    const ctx = await workspaceContext({ root: FIXTURE, messages: ask('Hello') })
    const blocks = ctx.system as { text: string; cache?: boolean }[]
    const cached = blocks.find((b) => b.cache)!
    expect(cached.text).toContain('<document path="README.md">')
    expect(cached.text).toContain('<document path="_index.md">')
    for (const p of [
      'wiki/concepts/positioning-statement.md',
      'wiki/topics/ideal-customer-profile.md',
      'wiki/concepts/value-drivers.md',
      'wiki/topics/competitive-landscape.md'
    ])
      expect(cached.text).toContain(`<document path="${p}">`)
    expect(text(ctx.system)).toContain('no web access')
    expect(text(ctx.system).replace(/```[\s\S]*?```/g, '')).not.toContain('\u2014')
  })

  it('loads at most 6 more articles, the ones matching the question, and names them', async () => {
    const ctx = await workspaceContext({
      root: FIXTURE,
      messages: ask('What are our weaknesses against Wile Co and Road Runner Inc?')
    })
    const extra = ctx.sources.slice(4).map((s) => s.path)
    expect(extra.length).toBeLessThanOrEqual(MAX_QUESTION_ARTICLES)
    expect(extra).toContain('wiki/references/weaknesses.md')
    expect(extra).toContain('wiki/references/competitor-wile-co.md')
    expect(extra).toContain('wiki/references/competitor-road-runner-inc.md')
    expect(extra).not.toContain('wiki/topics/recent-developments.md')
    expect(ctx.sources[0]).toEqual({
      path: 'wiki/concepts/positioning-statement.md',
      title: 'Positioning Statement'
    })
  })

  it('adds raw sources only when the question asks for evidence', async () => {
    const plain = text(
      (await workspaceContext({ root: FIXTURE, messages: ask('Who is our ICP?') })).system
    )
    const proof = text(
      (await workspaceContext({ root: FIXTURE, messages: ask('What evidence supports our ICP?') }))
        .system
    )
    expect(plain).not.toContain('<document path="raw/')
    expect(proof).toContain('<document path="raw/')
  })

  it('scores exact aliases and title words above loose matches', () => {
    const f = (name: string, data: Record<string, unknown>) => ({
      rel: `wiki/topics/${name}.md`,
      kind: 'article' as const,
      dir: 'wiki/topics',
      name,
      data,
      body: ''
    })
    const icp = f('ideal-customer-profile', {
      title: 'Ideal Customer Profile',
      aliases: ['ICP'],
      summary: 'Who buys.'
    })
    const market = f('market-segment', {
      title: 'Market Segment',
      aliases: [],
      summary: 'The customer market.'
    })
    expect(scoreArticle('Who is our ICP?', icp)).toBeGreaterThan(
      scoreArticle('Who is our ICP?', market)
    )
    expect(scoreArticle('Tell me about the weather', icp)).toBe(0)
  })
})
