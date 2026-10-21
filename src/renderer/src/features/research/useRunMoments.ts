import { useEffect, useRef } from 'react'
import type { RunView } from '@shared/research'
import { StepIdSchema } from '@shared/playbook'
import { api } from '@/lib/api'
import { useApp } from '@/store/app'
import { doneScreenFor, markSeen, useResearch } from '@/store/research'
import { useToasts } from '@/store/toasts'

const READY_TOAST = 'playbook-ready'

/**
 * Safe to take the founder somewhere else (REQUIREMENTS-v4.4 3.2): only on the Research page with
 * nothing ticked, no dialog or sheet open, and no text field in use.
 */
export function safeToNavigate(): boolean {
  const app = useApp.getState()
  if (app.step !== 'home' || app.homeView !== 'research' || app.settingsOpen || app.regenPage)
    return false
  if (useResearch.getState().ticking) return false
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return false
  const el = document.activeElement
  if (el instanceof HTMLTextAreaElement) return false
  if (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button'].includes(el.type))
    return false
  return !(el instanceof HTMLElement && el.isContentEditable)
}

function showDoneScreen(runId: string): void {
  useToasts.getState().dismiss(READY_TOAST)
  useApp.getState().setHomeView('research')
  useResearch.getState().showDone(runId)
}

const topLevel = (run: RunView) => run.tasks.filter((t) => !t.parent)

/**
 * The moments at the end of a run (REQUIREMENTS-v4.4 3): the done screen when the playbook is
 * ready, or a toast and the sidebar "Ready" mark when it isn't safe to move the founder; toasts when
 * the messaging analysis or a run of chosen steps finishes. Mounted once, in the home shell.
 */
export function useRunMoments(): void {
  const run = useResearch((s) => s.run)
  const view = useApp((s) => s.homeView)
  const handled = useRef(new Set<string>())
  const prev = useRef<RunView | null>(null)
  /** The first run the app sees after launch (read from disk). */
  const launched = useRef(false)

  // Playbook ready: the done screen when safe, else a toast that stays.
  useEffect(() => {
    const atLaunch = !launched.current
    if (run) launched.current = true
    const id = doneScreenFor(run)
    if (!id || handled.current.has(id)) return
    handled.current.add(id)
    // Closed after the playbook was ready but before it was seen: show it now (REQUIREMENTS-v4.4 3.2).
    if (atLaunch || safeToNavigate()) return showDoneScreen(id)
    useToasts.getState().show({
      id: READY_TOAST,
      text: 'Your playbook is ready.',
      sticky: true,
      action: {
        label: 'Open playbook',
        run: () => {
          void markSeen(id)
          useApp.getState().openPlaybook({ step: 'overview', from: 'run' })
        }
      }
    })
  }, [run])

  // Coming back to the window: the done screen, if it's still unseen and safe (REQUIREMENTS-v4.4 3.2).
  useEffect(() => {
    const onFocus = (): void => {
      const id = doneScreenFor(useResearch.getState().run)
      if (id && useResearch.getState().doneShown !== id && safeToNavigate()) showDoneScreen(id)
    }
    window.addEventListener('focus', onFocus)
    // The OS notification was clicked: that is the founder asking for it.
    const off = api.onShowDone(() => {
      const id = doneScreenFor(useResearch.getState().run)
      if (id) showDoneScreen(id)
    })
    return () => {
      window.removeEventListener('focus', onFocus)
      off()
    }
  }, [])

  // Opening the playbook any other way counts as seeing it.
  useEffect(() => {
    const id = doneScreenFor(run)
    if (view === 'playbook' && id) {
      useToasts.getState().dismiss(READY_TOAST)
      void markSeen(id)
    }
  }, [view, run])

  // Runs that end without a done screen, and the messaging analysis finishing.
  useEffect(() => {
    const before = prev.current
    prev.current = run
    if (!run || !before || before.id !== run.id || run.kind === 'regen') return
    const status = (r: RunView, id: string) => r.tasks.find((t) => t.id === id)?.status

    if (
      status(run, 'messaging-analysis') === 'done' &&
      status(before, 'messaging-analysis') !== 'done'
    ) {
      useToasts.getState().show({
        id: 'messaging-ready',
        text: 'Messaging analysis is ready.',
        action: { label: 'Open', run: () => void useApp.getState().goHome('messaging') }
      })
    }

    if (!before.playbookReadyAt && run.playbookReadyAt && run.kind === 'playbook') {
      useToasts.getState().show({
        id: 'playbook-updated',
        text: 'Your playbook is updated.',
        action: {
          label: 'Open playbook',
          run: () =>
            useApp.getState().openPlaybook({
              step: 'overview',
              from: 'update',
              updated: [...StepIdSchema.options]
            })
        }
      })
    }

    const ended = (r: RunView) => r.status === 'done' || r.status === 'failed'
    if (ended(run) && !ended(before) && !run.playbookReadyAt && run.kind === 'selected') {
      if (useApp.getState().homeView === 'research') return
      const top = topLevel(run)
      const done = top.filter((t) => t.status === 'done')
      const text =
        run.status === 'failed'
          ? 'Some research steps did not finish.'
          : top.length === 1
            ? `${useResearch.getState().steps?.find((s) => s.id === top[0].id)?.title ?? top[0].title} is done.`
            : `${done.length} steps are done.`
      useToasts.getState().show({
        id: `run-${run.id}`,
        text,
        action: {
          label: top.length === 1 && run.status === 'done' ? 'Open' : 'View',
          run: () => void openResult(top.length === 1 ? top[0].id : null)
        }
      })
    }
  }, [run])
}

/** Opens one step's result where it lives, or the Research page. */
async function openResult(taskId: string | null): Promise<void> {
  if (taskId) {
    await useResearch.getState().loadSteps()
    const open = useResearch.getState().steps?.find((s) => s.id === taskId)?.open
    if (open) {
      await useApp.getState().goHome()
      return useApp.getState().openWikiFile(open)
    }
  }
  await useApp.getState().goHome('research')
}
