import { describe, expect, it } from 'vitest'
import { channels } from '../../src/shared/ipc-contract'
import { isAllowedExternalUrl } from '../../src/shared/links'
import { redact } from '../../src/main/log'
import { createChatService } from '../../src/main/services/chat'
import type { Provider } from '../../src/main/providers/types'

describe('ipc schemas', () => {
  it('reject malformed payloads', () => {
    expect(channels['provider:verifyKey'].req.safeParse({}).success).toBe(false)
    expect(channels['provider:verifyKey'].req.safeParse({ key: '' }).success).toBe(false)
    expect(channels['settings:setModel'].req.safeParse({ model: 1 }).success).toBe(false)
    expect(channels['workspace:confirm'].req.safeParse({ path: '' }).success).toBe(false)
    expect(channels['chat:start'].req.safeParse({ modeId: 'general', messages: [] }).success).toBe(
      false
    )
    expect(
      channels['chat:start'].req.safeParse({
        modeId: 'nope',
        messages: [{ role: 'user', content: 'x' }]
      }).success
    ).toBe(false)
    expect(
      channels['chat:start'].req.safeParse({
        modeId: 'general',
        messages: [{ role: 'system', content: 'x' }]
      }).success
    ).toBe(false)
    expect(channels['chat:cancel'].req.safeParse({ streamId: 5 }).success).toBe(false)
    expect(channels['shell:openExternal'].req.safeParse({}).success).toBe(false)
  })

  it('accept valid payloads', () => {
    expect(
      channels['chat:start'].req.safeParse({
        modeId: 'general',
        messages: [{ role: 'user', content: 'hi' }]
      }).success
    ).toBe(true)
    expect(channels['app:getState'].req.safeParse(undefined).success).toBe(true)
  })

  it('chat:start has no system prompt field', () => {
    const r = channels['chat:start'].req.safeParse({
      modeId: 'general',
      system: 'evil',
      messages: [{ role: 'user', content: 'hi' }]
    })
    expect(r.success && 'system' in r.data).toBe(false)
  })
})

describe('external link allowlist', () => {
  it('allows listed https hosts only', () => {
    expect(isAllowedExternalUrl('https://console.anthropic.com/')).toBe(true)
    expect(isAllowedExternalUrl('https://www.parallel79.com/x')).toBe(true)
    expect(isAllowedExternalUrl('http://github.com')).toBe(false)
    expect(isAllowedExternalUrl('https://evil.com')).toBe(false)
    expect(isAllowedExternalUrl('https://github.com.evil.com')).toBe(false)
    expect(isAllowedExternalUrl('https://user:pw@github.com')).toBe(false)
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedExternalUrl('not a url')).toBe(false)
  })
})

describe('log redaction', () => {
  it('strips anything that looks like a key', () => {
    expect(redact('failed with sk-ant-api03-AbC_123-x here')).toBe(
      'failed with sk-ant-[redacted] here'
    )
  })
})

describe('chat service', () => {
  it('uses the mode system prompt and supports cancel', async () => {
    let seenSystem = ''
    const fake: Provider = {
      id: 'anthropic',
      displayName: 'fake',
      verifyKey: async () => ({ ok: false, code: 'unknown' }),
      listModels: async () => [],
      pickDefaultModel: () => null,
      capabilities: async () => ({ webSearch: false, webFetch: false }),
      runTask: async () => {
        throw new Error('not used')
      },
      streamChat: ({ system, signal, onEvent }) =>
        new Promise<void>((resolve) => {
          seenSystem = system
          onEvent({ type: 'delta', text: 'hi' })
          signal.addEventListener('abort', () => {
            onEvent({ type: 'done', stopped: true })
            resolve()
          })
        })
    }
    const chat = createChatService()
    const events: string[] = []
    const id = chat.start({
      provider: fake,
      key: 'k',
      model: 'm',
      modeId: 'general',
      messages: [{ role: 'user', content: 'x' }],
      send: (_id, e) => events.push(e.type)
    })
    expect(seenSystem).toContain('PositioningHQ')
    expect(chat.activeCount()).toBe(1)
    chat.cancel(id)
    await new Promise((r) => setTimeout(r, 0))
    expect(events).toEqual(['delta', 'done'])
    expect(chat.activeCount()).toBe(0)
  })
})
