import { create } from 'zustand'
import type { StepId } from '@shared/playbook'
import type { AppState } from '@shared/types'
import type { Detection } from '@shared/workspace'
import { emptyProfile, type Profile } from '@shared/profile'
import { api, unwrap } from '@/lib/api'
import { isProfileStep, type WizardStep } from '@/features/onboarding/steps'

export type Step = 'welcome' | WizardStep | 'home'
/**
 * `wizard` is first-run setup. `replaceKey` and `changeFolder` re-run one step from Settings,
 * and `research` opens the start-research card from home. All of them return home.
 */
export type Flow = 'wizard' | 'replaceKey' | 'changeFolder' | 'research'
export type HomeView = 'chat' | 'wiki' | 'research' | 'playbook' | 'messaging' | 'use-wiki'

/**
 * Where the playbook page opens when another part of the app sends someone there
 * (REQUIREMENTS-v4 4.1, `playbook?step=value`): a step, optionally a value driver card or the gap box.
 */
export interface PlaybookTarget {
  step: StepId | 'overview'
  card?: string
  gap?: boolean
  /** Arrived from a finished run (first-look banner) or an update (REQUIREMENTS-v4.4 3.4). */
  from?: 'run' | 'update'
  /** For an update: the sections that changed. */
  updated?: StepId[]
}

/** What the Wiki pane shows when another view sends someone there. */
export interface WikiTarget {
  tab: 'articles' | 'sources' | 'changes'
  path: string
  /** Show only these sources, under this label (a playbook section's sources). */
  sources?: { label: string; paths: string[] }
  /** Changes tab: only this page's changes. */
  page?: { slug: string; title: string }
}

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
  profile: Profile | null
  homeView: HomeView
  setHomeView(view: HomeView): void
  wikiTarget: WikiTarget | null
  playbookTarget: PlaybookTarget | null
  /** Opens the playbook page on a step. */
  openPlaybook(target: PlaybookTarget): void
  /** Opens a wiki file where it belongs: articles and sources in the Wiki pane, outputs in their view. */
  openWikiFile(path: string): void
  sidebarCollapsed: boolean
  toggleSidebar(): void
  /** The page whose Regenerate preview is open (REQUIREMENTS-v3.1 4). */
  regenPage: string | null
  openRegenerate(page: string | null): void
  /** Home, showing this view. */
  goHome(view?: HomeView): Promise<void>
  settingsOpen: boolean
  loadError: boolean
  init(): Promise<void>
  refresh(): Promise<AppState | null>
  go(step: Step): void
  startFlow(flow: Flow): void
  endFlow(): Promise<void>
  /** Applies a change to the profile, saves it, and moves to the next step (resumable). */
  advance(edit: (p: Profile) => Profile, next: Step): Promise<void>
  /** Saves the profile without leaving the step. */
  saveProfile(edit: (p: Profile) => Profile): Promise<void>
  /** Decides what happens after the workspace is confirmed (REQUIREMENTS-v1 2.1). */
  beginOnboarding(detection: Detection): Promise<void>
  setPendingKey(key: string): void
  setSettingsOpen(open: boolean): void
  afterDisconnect(): Promise<void>
}

const COLLAPSED_KEY = 'phq.sidebarCollapsed'
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export const useApp = create<AppStore>((set, get) => ({
  state: null,
  step: 'welcome',
  flow: 'wizard',
  note: null,
  pendingKey: '',
  detection: null,
  profile: null,
  homeView: 'chat',
  setHomeView: (homeView) => set({ homeView }),
  wikiTarget: null,
  playbookTarget: null,
  openPlaybook: (playbookTarget) => set({ homeView: 'playbook', playbookTarget }),
  openWikiFile(path) {
    if (path.startsWith('output/positioning-playbook-')) return set({ homeView: 'playbook' })
    if (path.startsWith('output/messaging-analysis-')) return set({ homeView: 'messaging' })
    const tab = path.startsWith('raw/')
      ? 'sources'
      : /^wiki\/references\/decision-/.test(path)
        ? 'changes'
        : 'articles'
    set({ homeView: 'wiki', wikiTarget: { tab, path } })
  },
  regenPage: null,
  openRegenerate: (regenPage) => set({ regenPage }),
  sidebarCollapsed: readCollapsed(),
  toggleSidebar() {
    const sidebarCollapsed = !get().sidebarCollapsed
    set({ sidebarCollapsed })
    try {
      localStorage.setItem(COLLAPSED_KEY, sidebarCollapsed ? '1' : '0')
    } catch {
      // storage unavailable: the choice lasts for this session only
    }
  },
  async goHome(view) {
    await get().refresh()
    const profile = await unwrap(api.getProfile()).catch(() => get().profile)
    set({
      flow: 'wizard',
      step: 'home',
      note: null,
      pendingKey: '',
      profile,
      ...(view ? { homeView: view } : {})
    })
  },
  setDetection: (detection) => set({ detection }),
  settingsOpen: false,
  loadError: false,

  async init() {
    try {
      const state = await unwrap(api.getState())
      set({ state, step: state.route, note: state.note, flow: 'wizard', loadError: false })
      // Quit mid-onboarding: resume at the step the user reached.
      if (state.route === 'home') {
        const profile = await unwrap(api.getProfile()).catch(() => null)
        set({ profile })
        if (profile && !profile.onboarding.complete && isProfileStep(profile.onboarding.step)) {
          set({ step: profile.onboarding.step })
        }
      }
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
      step: flow === 'replaceKey' ? 'connect' : flow === 'research' ? 'start' : 'workspace',
      note: null,
      settingsOpen: false,
      pendingKey: ''
    })
  },

  async endFlow() {
    await get().goHome()
  },

  async advance(edit, next) {
    const profile = edit(get().profile ?? emptyProfile())
    profile.onboarding.step = next
    set({ profile })
    await unwrap(api.saveProfile(profile))
    set({ step: next, note: null })
  },

  async saveProfile(edit) {
    const profile = edit(get().profile ?? emptyProfile())
    set({ profile })
    await unwrap(api.saveProfile(profile))
  },

  async beginOnboarding(detection) {
    // A researched wiki, or one from a newer app (read-only), opens straight to Home.
    if (detection.kind === 'phq-complete' || detection.kind === 'phq-newer') return get().endFlow()
    const existing = await unwrap(api.getProfile())
    if (existing?.onboarding.complete) return get().endFlow()
    const profile = existing ?? emptyProfile()
    // A skill-pack vault already knows the company. Prefill what's empty.
    if (detection.company) {
      profile.company.name ||= detection.company.name
      profile.company.website ||= detection.company.website
    }
    const step = isProfileStep(profile.onboarding.step) ? profile.onboarding.step : 'company'
    profile.onboarding.step = step
    await unwrap(api.saveProfile(profile))
    set({ profile, flow: 'wizard', step, note: null })
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
