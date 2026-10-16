import { Plus, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Wordmark } from '@/components/Wordmark'
import { useApp } from '@/store/app'
import { useChat } from '@/store/chat'
import { ChatSession } from './ChatSession'

export function ChatScreen() {
  const state = useApp((s) => s.state)
  const hasMessages = useChat((s) => s.messages.length > 0)
  const isMac = state?.platform === 'mac'

  return (
    <div className="flex h-full flex-col">
      <header
        className={`bg-muted drag flex h-[52px] shrink-0 items-center justify-between border-b pr-4 ${isMac ? 'pl-[88px]' : 'pl-6'}`}
      >
        <Wordmark />
        <div className="no-drag flex items-center gap-2">
          {state?.modelName && (
            <span className="text-muted-foreground mr-1 text-[13px]">{state.modelName}</span>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={!hasMessages}
            onClick={() => useChat.getState().reset()}
          >
            <Plus strokeWidth={1.8} />
            New chat
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Settings"
            onClick={() => useApp.getState().setSettingsOpen(true)}
          >
            <Settings strokeWidth={1.8} />
          </Button>
        </div>
      </header>
      <ChatSession modeId="general" />
    </div>
  )
}
