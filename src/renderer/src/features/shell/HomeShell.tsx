import { useEffect } from 'react'
import { useApp } from '@/store/app'
import { useDocs } from '@/store/docs'
import { useResearch } from '@/store/research'
import { ChatView } from '@/features/chat/ChatView'
import { MessagingView } from '@/features/messaging/MessagingView'
import { PlaybookView } from '@/features/playbook/PlaybookView'
import { TrainingDataView } from '@/features/training-data/TrainingDataView'
import { ResearchBanner } from './ResearchBanner'
import { Sidebar } from './Sidebar'

export function HomeShell() {
  const view = useApp((s) => s.homeView)
  const runStatus = useResearch((s) => s.run?.status)

  // The playbook and analysis can appear from a run finishing or from a file change on disk.
  useEffect(() => {
    void useDocs.getState().refresh()
    return window.api.onWorkspaceChanged(({ paths }) => {
      if (
        paths.some(
          (p) =>
            p.startsWith('memory/positioning-playbook/') ||
            p.startsWith('memory/messaging-analysis/')
        )
      ) {
        void useDocs.getState().refresh()
      }
    })
  }, [])
  useEffect(() => {
    void useDocs.getState().refresh()
  }, [runStatus])

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
        <ResearchBanner />
        <div className="min-h-0 flex-1">
          {view === 'chat' && <ChatView />}
          {view === 'training' && <TrainingDataView />}
          {view === 'playbook' && <PlaybookView />}
          {view === 'messaging' && <MessagingView />}
        </div>
      </main>
    </div>
  )
}
