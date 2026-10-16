import { useEffect } from 'react'
import { useApp } from '@/store/app'
import { useDocs } from '@/store/docs'
import { useResearch } from '@/store/research'
import { ChatView } from '@/features/chat/ChatView'
import { PlaybookView } from '@/features/playbook/PlaybookView'
import { ResearchBanner } from './ResearchBanner'
import { Sidebar } from './Sidebar'

export function HomeShell() {
  const view = useApp((s) => s.homeView)
  const runStatus = useResearch((s) => s.run?.status)

  // The playbook can appear from a run finishing or from a file change on disk.
  useEffect(() => {
    void useDocs.getState().refresh()
    return window.api.onWorkspaceChanged(({ paths }) => {
      if (paths.some((p) => p.startsWith('memory/positioning-playbook/')))
        void useDocs.getState().refresh()
    })
  }, [])
  useEffect(() => {
    void useDocs.getState().refresh()
  }, [runStatus])

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <ResearchBanner />
        <div className="min-h-0 flex-1">
          {view === 'playbook' ? <PlaybookView /> : <ChatView />}
        </div>
      </main>
    </div>
  )
}
