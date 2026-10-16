import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApp } from '@/store/app'
import { useChat } from '@/store/chat'
import { useDocs } from '@/store/docs'
import { ChatSession } from './ChatSession'
import { goalStarters } from './starters'

export function ChatView() {
  const modelName = useApp((s) => s.state?.modelName)
  const profile = useApp((s) => s.profile)
  const hasMessages = useChat((s) => s.messages.length > 0)
  const title = useChat((s) => s.messages.find((m) => m.role === 'user')?.content)
  // Grounded in the workspace once there is a playbook. Until then, the general guide.
  const grounded = useDocs((s) => !!s.playbookPath)
  const modeId = grounded ? 'workspace' : 'general'

  return (
    <div className="flex h-full flex-col">
      <header className="drag flex h-[52px] shrink-0 items-center justify-between gap-4 border-b px-6">
        <div className="min-w-0">
          <h2 className="truncate text-[17px]">{hasMessages && title ? title : 'Chat'}</h2>
        </div>
        <div className="no-drag flex shrink-0 items-center gap-2">
          <span className="text-muted-foreground mr-1 text-[13px]">
            {grounded ? 'Grounded in your playbook' : 'General guide'}
            {modelName ? ` · ${modelName}` : ''}
          </span>
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
      <ChatSession
        modeId={modeId}
        starters={grounded ? goalStarters(profile) : undefined}
        note={grounded ? 'Answers use your playbook, research and messaging analysis.' : undefined}
      />
    </div>
  )
}
