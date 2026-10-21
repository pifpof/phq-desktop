import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlaybookNav, PlaybookView } from '@shared/playbook'
import type { OutputVersion } from '@shared/wiki-views'
import { api, unwrap } from '@/lib/api'
import { useApp } from '@/store/app'
import { useChanges } from '@/store/changes'
import { useResearch } from '@/store/research'

/** The page model for a version (null: the newest). Reloads when the wiki or a run changes. */
export function usePlaybookView(path: string | null): {
  view: PlaybookView | null | undefined
  reload: () => void
} {
  const [view, setView] = useState<PlaybookView | null | undefined>(undefined)
  const seq = useRef(0)
  const reload = useCallback(() => {
    const n = ++seq.current
    void unwrap(api.playbookView(path))
      .catch(() => null)
      .then((v) => {
        if (n === seq.current) setView(v)
      })
  }, [path])
  useEffect(() => {
    reload()
    let timer: ReturnType<typeof setTimeout> | null = null
    const off = api.onWorkspaceChanged(({ paths }) => {
      if (!paths.some((p) => p.startsWith('output/') || p.startsWith('wiki/'))) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(reload, 250)
    })
    return () => {
      off()
      if (timer) clearTimeout(timer)
    }
  }, [reload])
  // Waiting changes and runs change the right panel and the takeaways.
  const runStatus = useResearch((s) => s.run?.status)
  const changes = useChanges((s) => s.changes)
  const profile = useApp((s) => s.profile)
  useEffect(() => reload(), [runStatus, changes, profile, reload])
  return { view, reload }
}

/** Every playbook version, newest first. */
export function useVersions(): OutputVersion[] {
  const [versions, setVersions] = useState<OutputVersion[]>([])
  useEffect(() => {
    const load = (): void => {
      void unwrap(api.listOutputs('positioning-playbook'))
        .catch(() => [])
        .then(setVersions)
    }
    load()
    return api.onWorkspaceChanged(({ paths }) => {
      if (paths.some((p) => p.startsWith('output/positioning-playbook-'))) load()
    })
  }, [])
  return versions
}

/** Visited steps per version and the last step, in app state (REQUIREMENTS-v4 4.1). */
export function usePlaybookNav(): {
  nav: PlaybookNav | null
  /** Saves a change to the latest state, so two changes in one render both stick. */
  save: (change: (nav: PlaybookNav) => PlaybookNav) => void
} {
  const [nav, setNav] = useState<PlaybookNav | null>(null)
  useEffect(() => {
    void unwrap(api.playbookNav())
      .catch(() => ({ visited: {}, last: null, firstLook: false }))
      .then(setNav)
  }, [])
  const save = useCallback((change: (nav: PlaybookNav) => PlaybookNav) => {
    setNav((prev) => {
      if (!prev) return prev
      const next = change(prev)
      void api.setPlaybookNav(next)
      return next
    })
  }, [])
  return { nav, save }
}
