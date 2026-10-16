import type { ComponentType } from 'react'
import {
  BookOpen,
  Database,
  Folder,
  Gauge,
  MessageSquare,
  PanelLeft,
  Settings,
  type LucideProps
} from 'lucide-react'
import { Wordmark } from '@/components/Wordmark'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useApp, type HomeView } from '@/store/app'
import { RecentChats } from './RecentChats'
import { ResearchPill } from './ResearchPill'

const NAV: { view: HomeView; label: string; Icon: ComponentType<LucideProps> }[] = [
  { view: 'chat', label: 'Chat', Icon: MessageSquare },
  { view: 'training', label: 'Training Data', Icon: Database },
  { view: 'playbook', label: 'Positioning Playbook', Icon: BookOpen },
  { view: 'messaging', label: 'Messaging Analysis', Icon: Gauge }
]

export function Sidebar() {
  const view = useApp((s) => s.homeView)
  const collapsed = useApp((s) => s.sidebarCollapsed)
  const isMac = useApp((s) => s.state?.platform === 'mac')
  const company = useApp((s) => s.profile?.company.name)
  const workspace = useApp((s) => s.state?.workspacePath ?? '')
  const revealLabel = useApp((s) => s.state?.revealLabel ?? 'Show in Finder')
  const folder = workspace.split(/[\\/]/).filter(Boolean).pop() ?? workspace
  const shortcut = isMac ? 'Cmd+B' : 'Ctrl+B'

  const item = cn(
    'flex w-full items-center gap-2.5 rounded-[10px] py-2 text-left text-[15px] font-medium outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]',
    collapsed ? 'justify-center px-0' : 'px-3'
  )

  return (
    <aside
      className={cn(
        'bg-muted flex shrink-0 flex-col border-r transition-[width] duration-150',
        collapsed ? 'w-[64px]' : 'w-[240px]'
      )}
    >
      <div
        className={cn(
          'drag flex h-[64px] shrink-0 items-center gap-2 pr-2',
          isMac ? (collapsed ? 'pl-0' : 'pl-[78px]') : 'pl-4'
        )}
      >
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <Wordmark />
            {company && (
              <span className="text-muted-foreground -mt-0.5 block truncate text-[13px]">
                {company}
              </span>
            )}
          </div>
        )}
      </div>

      <nav className="mt-2 space-y-0.5 px-3" aria-label="Main">
        {NAV.map(({ view: v, label, Icon }) => (
          <div key={v}>
            <button
              type="button"
              title={collapsed ? label : undefined}
              aria-label={collapsed ? label : undefined}
              aria-current={view === v ? 'page' : undefined}
              onClick={() => useApp.getState().setHomeView(v)}
              className={cn(item, view === v ? 'bg-accent text-primary' : 'hover:bg-secondary')}
            >
              <Icon className="size-[18px] shrink-0" strokeWidth={1.8} />
              {!collapsed && label}
            </button>
            {v === 'chat' && !collapsed && <RecentChats />}
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="mt-4">
          <ResearchPill />
        </div>
      )}

      <div className="mt-auto space-y-0.5 border-t px-3 py-3">
        <button
          type="button"
          className={cn(item, 'hover:bg-secondary')}
          title={`${revealLabel}: ${workspace}`}
          aria-label={collapsed ? revealLabel : undefined}
          onClick={() => void api.revealWorkspace()}
        >
          <Folder className="size-[18px] shrink-0" strokeWidth={1.8} />
          {!collapsed && <span className="truncate">{folder}</span>}
        </button>
        <button
          type="button"
          className={cn(item, 'hover:bg-secondary')}
          aria-label={collapsed ? 'Settings' : undefined}
          title={collapsed ? 'Settings' : undefined}
          onClick={() => useApp.getState().setSettingsOpen(true)}
        >
          <Settings className="size-[18px] shrink-0" strokeWidth={1.8} />
          {!collapsed && 'Settings'}
        </button>
        <button
          type="button"
          className={cn(item, 'text-muted-foreground hover:bg-secondary text-[13px]')}
          title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (${shortcut})`}
          aria-label={`${collapsed ? 'Expand' : 'Collapse'} sidebar`}
          onClick={() => useApp.getState().toggleSidebar()}
        >
          <PanelLeft className="size-[18px] shrink-0" strokeWidth={1.8} />
          {!collapsed && `Collapse (${shortcut})`}
        </button>
      </div>
    </aside>
  )
}
