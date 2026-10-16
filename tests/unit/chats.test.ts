import { mkdtempSync, readdirSync, writeFileSync, mkdirSync } from 'fs'
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
import { workspaceSystem } from '../../src/main/modes/workspace'
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
    expect(readdirSync(join(root, '.positioninghq/chats'))).toEqual([`${B}.json`])
  })

  it('refuses IDs that are not chat IDs, so nothing outside the chats folder is touched', async () => {
    const root = mkdtempSync(join(tmpdir(), 'phq-chats-'))
    expect(await getChat(root, '../../profile')).toBeNull()
    await expect(saveChat(root, { ...chat(A, 1), id: '../x' })).rejects.toThrow()
    await expect(deleteChat(root, '../../settings')).rejects.toThrow()
  })

  it('ignores corrupt chat files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'phq-chats-'))
    mkdirSync(join(root, '.positioninghq/chats'), { recursive: true })
    writeFileSync(join(root, '.positioninghq/chats', `${A}.json`), '{nope')
    expect(await listChats(root)).toEqual([])
  })

  it('titles a chat by its first question', () => {
    expect(chatTitle('  What   is our positioning? ')).toBe('What is our positioning?')
    expect(chatTitle('x'.repeat(100))).toHaveLength(60)
    expect(chatTitle('')).toBe('New chat')
  })
})

describe('workspace chat mode', () => {
  it('falls back to the general prompt until a playbook exists', async () => {
    expect(await workspaceSystem({ root: null })).toBe(generalPrompt)
    expect(await workspaceSystem({ root: mkdtempSync(join(tmpdir(), 'phq-ws-')) })).toBe(
      generalPrompt
    )
  })

  it('grounds the chat in the playbook, synthesis, website positioning and messaging analysis, cached, with no web', async () => {
    const root = mkdtempSync(join(tmpdir(), 'phq-ws-'))
    const w = (rel: string, body: string) => {
      mkdirSync(join(root, rel, '..'), { recursive: true })
      writeFileSync(join(root, rel), `---\nstatus: draft\n---\n${body}`)
    }
    w(
      'memory/positioning-playbook/Acme.md',
      '# Positioning Playbook: Acme\n\n## Section 5: Positioning Statement\nFor coyotes who need speed.'
    )
    w('memory/positioning-playbook/versions/Acme-v1-2026-10-16.md', 'OLD VERSION')
    w('memory/company-research/steps/09-synthesis.md', 'Market moves fast.')
    w('memory/research/website-positioning.md', 'Hero: Rockets.')
    w('memory/messaging-analysis/Acme.md', 'Clarity 3/5.')
    const blocks = await workspaceSystem({ root })
    expect(Array.isArray(blocks)).toBe(true)
    const text = (blocks as { text: string }[]).map((b) => b.text).join('\n')
    for (const s of [
      'For coyotes who need speed.',
      'Market moves fast.',
      'Hero: Rockets.',
      'Clarity 3/5.',
      'no web access'
    ])
      expect(text).toContain(s)
    expect(text).not.toContain('OLD VERSION')
    expect(text).not.toContain('—')
    expect((blocks as { cache?: boolean }[]).at(-1)?.cache).toBe(true)
  })
})
