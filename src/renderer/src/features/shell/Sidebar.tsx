import type { ComponentType } from 'react'
import { BookOpen, Folder, MessageSquare, Settings, type LucideProps } from 'lucide-react'
import { Wordmark } from '@/components/Wordmark'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useApp, type HomeView } from '@/store/app'
import { ResearchPill } from './ResearchPill'

const NAV: { view: HomeView; label: string; Icon: ComponentType<LucideProps> }[] = [
  { view: 'chat', label: 'Chat', Icon: MessageSquare },
  { view: 'playbook', label: 'Positioning Playbook', Icon: BookOpen }
]

export function Sidebar() {
  const view = useApp((s) => s.homeView)
  const isMac = useApp((s) => s.state?.platform === 'mac')
  const company = useApp((s) => s.profile?.company.name)
  const workspace = useApp((s) => s.state?.workspacePath ?? '')
  const revealLabel = useApp((s) => s.state?.revealLabel ?? 'Show in Finder')
  const folder = workspace.split(/[\\/]/).filter(Boolean).pop() ?? workspace

  const item =
    'flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[15px] font-medium outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]'

  return (
    <aside className="bg-muted flex w-[240px] shrink-0 flex-col border-r">
      <div
        className={cn(
          'drag flex h-[64px] shrink-0 flex-col justify-center pr-3',
          isMac ? 'pl-[78px]' : 'pl-5'
        )}
      >
        <Wordmark />
        {company && (
          <span className="text-muted-foreground -mt-0.5 truncate text-[13px]">{company}</span>
        )}
      </div>

      <nav className="mt-2 space-y-0.5 px-3" aria-label="Main">
        {NAV.map(({ view: v, label, Icon }) => (
          <button
            key={v}
            type="button"
            aria-current={view === v ? 'page' : undefined}
            onClick={() => useApp.getState().setHomeView(v)}
            className={cn(item, view === v ? 'bg-accent text-primary' : 'hover:bg-secondary')}
          >
            <Icon className="size-[18px]" strokeWidth={1.8} />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-4">
        <ResearchPill />
      </div>

      <div className="mt-auto space-y-0.5 border-t px-3 py-3">
        <button
          type="button"
          className={cn(item, 'hover:bg-secondary')}
          title={`${revealLabel}: ${workspace}`}
          onClick={() => void api.revealWorkspace()}
        >
          <Folder className="size-[18px] shrink-0" strokeWidth={1.8} />
          <span className="truncate">{folder}</span>
        </button>
        <button
          type="button"
          className={cn(item, 'hover:bg-secondary')}
          onClick={() => useApp.getState().setSettingsOpen(true)}
        >
          <Settings className="size-[18px]" strokeWidth={1.8} />
          Settings
        </button>
      </div>
    </aside>
  )
}
