import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApp } from '@/store/app'
import { useChat } from '@/store/chat'
import { ChatSession } from './ChatSession'

export function ChatView() {
  const modelName = useApp((s) => s.state?.modelName)
  const hasMessages = useChat((s) => s.messages.length > 0)

  return (
    <div className="flex h-full flex-col">
      <header className="drag flex h-[52px] shrink-0 items-center justify-between border-b px-6">
        <h2 className="text-[17px]">Chat</h2>
        <div className="no-drag flex items-center gap-2">
          {modelName && <span className="text-muted-foreground mr-1 text-[13px]">{modelName}</span>}
          <Button
            variant="ghost"
            size="sm"
            disabled={!hasMessages}
            onClick={() => useChat.getState().reset()}
          >
            <Plus strokeWidth={1.8} />
            New chat
          </Button>
        </div>
      </header>
      <ChatSession modeId="general" />
    </div>
  )
}
