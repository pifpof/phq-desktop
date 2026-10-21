import type { ComponentType } from 'react'
import {
  BookOpen,
  BookText,
  Folder,
  Gauge,
  ListChecks,
  Share2,
  MessageSquare,
  PanelLeft,
  Settings,
  type LucideProps
} from 'lucide-react'
import icon from '@/assets/images/icon.png'
import logo from '@/assets/images/phq-logo.png'
import { api } from '@/lib/api'
import { useChanges, waitingCount } from '@/store/changes'
import { cn } from '@/lib/utils'
import { useApp, type HomeView } from '@/store/app'
import { doneScreenFor, useResearch } from '@/store/research'
import { RecentChats } from './RecentChats'
import { ResearchPill } from './ResearchPill'

const NAV: { view: HomeView; label: string; Icon: ComponentType<LucideProps> }[] = [
  { view: 'chat', label: 'Chat', Icon: MessageSquare },
  { view: 'wiki', label: 'Wiki', Icon: BookText },
  { view: 'research', label: 'Research', Icon: ListChecks },
  { view: 'playbook', label: 'Positioning Playbook', Icon: BookOpen },
  { view: 'messaging', label: 'Messaging Analysis', Icon: Gauge },
  { view: 'use-wiki', label: 'Use your wiki', Icon: Share2 }
]

export function Sidebar() {
  const view = useApp((s) => s.homeView)
  const collapsed = useApp((s) => s.sidebarCollapsed)
  const isMac = useApp((s) => s.state?.platform === 'mac')
  const company = useApp((s) => s.profile?.company.name)
  const waiting = useChanges((s) => waitingCount(s.changes))
  // The playbook is ready and the founder hasn't seen it (REQUIREMENTS-v4.4 3.2).
  const ready = useResearch((s) => {
    const id = doneScreenFor(s.run)
    return !!id && s.doneShown !== id
  })
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
      {/* Drag strip; on macOS it holds the window controls. */}
      <div className={cn('drag shrink-0', isMac ? 'h-[48px]' : 'h-4')} />

      {collapsed ? (
        <div className="flex justify-center">
          <img src={icon} alt="PositioningHQ" className="size-9 rounded-[10px] border" />
        </div>
      ) : (
        <div className="min-w-0 px-6">
          <img src={logo} alt="PositioningHQ" className="block h-[22px] w-auto max-w-full" />
          {company && (
            <span className="text-muted-foreground mt-1 block truncate text-[13px]">{company}</span>
          )}
        </div>
      )}

      <nav className="mt-4 space-y-0.5 px-3" aria-label="Main">
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
              <span className="relative">
                <Icon className="size-[18px] shrink-0" strokeWidth={1.8} />
                {((v === 'wiki' && waiting > 0) || (v === 'playbook' && ready)) && collapsed && (
                  <span className="bg-primary absolute -top-1 -right-1.5 size-2 rounded-full" />
                )}
              </span>
              {!collapsed && label}
              {!collapsed && v === 'playbook' && ready && (
                <span className="text-primary ml-auto flex items-center gap-1.5 text-[12px] font-semibold">
                  <span className="bg-primary size-2 rounded-full" aria-hidden />
                  Ready
                </span>
              )}
              {!collapsed && v === 'wiki' && waiting > 0 && (
                <span
                  className="bg-primary text-primary-foreground ml-auto rounded-full px-1.5 text-[11px] leading-[18px] font-semibold tabular-nums"
                  title={`${waiting} ${waiting === 1 ? 'change' : 'changes'} waiting`}
                >
                  {waiting}
                  <span className="sr-only"> {waiting === 1 ? 'change' : 'changes'} waiting</span>
                </span>
              )}
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
