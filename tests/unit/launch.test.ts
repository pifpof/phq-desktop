import { describe, expect, it } from 'vitest'
import { computeRoute } from '../../src/main/launch'
import { defaultSettings } from '../../src/main/services/settings'

const done = { ...defaultSettings(), onboardingComplete: true, workspacePath: '/w' }

describe('launch routing', () => {
  it('goes to welcome before onboarding is complete', () => {
    expect(
      computeRoute({ settings: defaultSettings(), hasKey: true, workspaceWritable: true }).route
    ).toBe('welcome')
  })
  it('goes to connect when the key is missing', () => {
    const r = computeRoute({ settings: done, hasKey: false, workspaceWritable: true })
    expect(r).toEqual({ route: 'connect', note: 'Reconnect your AI to continue' })
  })
  it('goes to workspace when the folder is missing or unwritable', () => {
    const r = computeRoute({ settings: done, hasKey: true, workspaceWritable: false })
    expect(r).toEqual({ route: 'workspace', note: "We couldn't find your workspace folder" })
  })
  it('goes home when everything is valid', () => {
    expect(computeRoute({ settings: done, hasKey: true, workspaceWritable: true })).toEqual({
      route: 'home',
      note: null
    })
  })
})
