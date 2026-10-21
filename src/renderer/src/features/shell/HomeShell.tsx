import { useEffect } from 'react'
import { useApp } from '@/store/app'
import { useChanges } from '@/store/changes'
import { useDocs } from '@/store/docs'
import { useRegen } from '@/store/regen'
import { useResearch } from '@/store/research'
import { ChatView } from '@/features/chat/ChatView'
import { MessagingView } from '@/features/messaging/MessagingView'
import { PlaybookView } from '@/features/playbook/PlaybookView'
import { ResearchView } from '@/features/research/ResearchView'
import { WikiView } from '@/features/wiki/WikiView'
import { UseWikiView } from '@/features/use-wiki/UseWikiView'
import { MigrationWizard } from '@/features/migrate/MigrationWizard'
import { ResearchBanner } from './ResearchBanner'
import { Sidebar } from './Sidebar'
import { WorkspaceBanner } from './WorkspaceBanner'
import { RegeneratePreview } from '@/features/regenerate/RegeneratePreview'
import { ReviewResult } from '@/features/regenerate/ReviewResult'

export function HomeShell() {
  const view = useApp((s) => s.homeView)
  const runStatus = useResearch((s) => s.run?.status)
  const needsMigration = useApp((s) => s.state?.workspaceStatus === 'needs-migration')

  // The playbook and analysis can appear from a run finishing or from a file change on disk.
  useEffect(() => {
    void useDocs.getState().refresh()
    return window.api.onWorkspaceChanged(({ paths }) => {
      if (paths.some((p) => p.startsWith('output/'))) {
        void useDocs.getState().refresh()
      }
    })
  }, [])
  useEffect(() => {
    void useDocs.getState().refresh()
    // Which page is regenerating, if any (its Regenerate button spins).
    void useRegen.getState().load()
  }, [runStatus])

  // Changes (REQUIREMENTS-v3.1 3.5): the waiting count shows everywhere, so keep them loaded.
  useEffect(() => {
    void useChanges.getState().load()
    return window.api.onWikiTreeChanged(() => void useChanges.getState().load())
  }, [])

  // Cmd+B (Ctrl+B) collapses the sidebar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        useApp.getState().toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <WorkspaceBanner />
        <ResearchBanner />
        <div className="min-h-0 flex-1">
          {needsMigration && <MigrationWizard />}
          {!needsMigration && view === 'chat' && <ChatView />}
          {!needsMigration && view === 'wiki' && <WikiView />}
          {!needsMigration && view === 'research' && <ResearchView />}
          {!needsMigration && view === 'playbook' && <PlaybookView />}
          {!needsMigration && view === 'messaging' && <MessagingView />}
          {!needsMigration && view === 'use-wiki' && <UseWikiView />}
        </div>
      </main>
      <RegeneratePreview />
      <ReviewResult />
    </div>
  )
}
