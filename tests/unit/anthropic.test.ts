import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import { mapAnthropicError, pickDefaultModel } from '../../src/main/providers/anthropic'

const h = new Headers()
const err = <T>(C: new (...a: never[]) => T, status: number, body: unknown, msg = 'x') =>
  (C as unknown as { generate(s: number, b: unknown, m: string, h: Headers): T }).generate(
    status,
    body,
    msg,
    h
  )

describe('anthropic error mapping', () => {
  it('maps auth, permission and rate limit', () => {
    expect(mapAnthropicError(err(Anthropic.AuthenticationError, 401, {}))).toEqual({
      code: 'invalid_key'
    })
    expect(mapAnthropicError(err(Anthropic.PermissionDeniedError, 403, {}))).toEqual({
      code: 'no_permission'
    })
    expect(mapAnthropicError(err(Anthropic.RateLimitError, 429, {}))).toEqual({
      code: 'rate_limited'
    })
  })

  it('maps a 400 credit balance message to no_credit', () => {
    const e = err(
      Anthropic.BadRequestError,
      400,
      { error: { type: 'invalid_request_error', message: 'Your credit balance is too low' } },
      '400 Your credit balance is too low'
    )
    expect(mapAnthropicError(e)).toEqual({ code: 'no_credit' })
  })

  it('maps 529 and overloaded_error to overloaded', () => {
    expect(mapAnthropicError(err(Anthropic.InternalServerError, 529, {})).code).toBe('overloaded')
    expect(
      mapAnthropicError(
        err(Anthropic.InternalServerError, 500, { error: { type: 'overloaded_error' } })
      ).code
    ).toBe('overloaded')
  })

  it('maps connection failures to network', () => {
    expect(mapAnthropicError(new Anthropic.APIConnectionError({}))).toEqual({ code: 'network' })
  })

  it('maps anything else to unknown with only the error type', () => {
    const e = err(
      Anthropic.BadRequestError,
      400,
      { error: { type: 'invalid_request_error', message: 'secret details' } },
      'secret details'
    )
    expect(mapAnthropicError(e)).toEqual({ code: 'unknown', detail: 'invalid_request_error' })
    expect(mapAnthropicError(new Error('boom'))).toEqual({ code: 'unknown' })
  })
})

describe('default model rule', () => {
  const m = (id: string) => ({ id, displayName: id, createdAt: '' })
  it('picks the first sonnet, else the first model', () => {
    expect(pickDefaultModel([m('a-opus'), m('b-sonnet-2'), m('c-sonnet-1')])).toBe('b-sonnet-2')
    expect(pickDefaultModel([m('a-opus'), m('b-haiku')])).toBe('a-opus')
    expect(pickDefaultModel([])).toBeNull()
  })
})
