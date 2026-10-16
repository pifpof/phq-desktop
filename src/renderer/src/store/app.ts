import { create } from 'zustand'
import type { AppState } from '@shared/types'
import type { Detection } from '@shared/workspace'
import { api, unwrap } from '@/lib/api'

export type Step = 'welcome' | 'connect' | 'verify' | 'workspace' | 'done' | 'chat'
/** `wizard` is first-run setup. The others re-run one step from Settings and return to chat. */
export type Flow = 'wizard' | 'replaceKey' | 'changeFolder'

interface AppStore {
  state: AppState | null
  step: Step
  flow: Flow
  note: string | null
  /** Held only between "Verify key" and a successful verification. */
  pendingKey: string
  /** What was found in the chosen folder before it was set up. Drives onboarding in later steps. */
  detection: Detection | null
  setDetection(d: Detection | null): void
  settingsOpen: boolean
  loadError: boolean
  init(): Promise<void>
  refresh(): Promise<AppState | null>
  go(step: Step): void
  startFlow(flow: Flow): void
  endFlow(): Promise<void>
  setPendingKey(key: string): void
  setSettingsOpen(open: boolean): void
  afterDisconnect(): Promise<void>
}

export const useApp = create<AppStore>((set, get) => ({
  state: null,
  step: 'welcome',
  flow: 'wizard',
  note: null,
  pendingKey: '',
  detection: null,
  setDetection: (detection) => set({ detection }),
  settingsOpen: false,
  loadError: false,

  async init() {
    try {
      const state = await unwrap(api.getState())
      set({ state, step: state.route, note: state.note, flow: 'wizard', loadError: false })
    } catch {
      set({ loadError: true })
    }
  },

  async refresh() {
    try {
      const state = await unwrap(api.getState())
      set({ state })
      return state
    } catch {
      return null
    }
  },

  go: (step) => set({ step, note: null }),

  startFlow(flow) {
    set({
      flow,
      step: flow === 'replaceKey' ? 'connect' : 'workspace',
      note: null,
      settingsOpen: false,
      pendingKey: ''
    })
  },

  async endFlow() {
    await get().refresh()
    set({ flow: 'wizard', step: 'chat', note: null, pendingKey: '' })
  },

  setPendingKey: (pendingKey) => set({ pendingKey }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

  async afterDisconnect() {
    const state = await get().refresh()
    set({
      flow: 'wizard',
      step: 'connect',
      note: state?.note ?? 'Reconnect your AI to continue',
      settingsOpen: false,
      pendingKey: ''
    })
  }
}))
