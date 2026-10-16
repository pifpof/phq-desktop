import { useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useChat } from '@/store/chat'
import { useChats } from '@/store/chats'

const SHOWN = 8

/** Recent saved chats under Chat in the sidebar: open, rename, delete. */
export function RecentChats() {
  const chats = useChats((s) => s.chats)
  const activeId = useChat((s) => s.chatId)
  const view = useApp((s) => s.homeView)
  const [editing, setEditing] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    void useChats.getState().refresh()
  }, [])

  if (chats.length === 0) return null

  const open = (id: string): void => {
    useApp.getState().setHomeView('chat')
    if (id !== activeId) void useChat.getState().open(id)
  }
  const saveTitle = async (id: string): Promise<void> => {
    if (title.trim()) await useChats.getState().rename(id, title)
    setEditing(null)
  }

  return (
    <div className="mt-1 mb-1">
      <ul aria-label="Recent chats" className="space-y-px pl-7">
        {chats.slice(0, SHOWN).map((c) => (
          <li key={c.id} className="group relative">
            {editing === c.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void saveTitle(c.id)
                }}
              >
                <input
                  autoFocus
                  aria-label="Chat name"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => void saveTitle(c.id)}
                  onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                  className="border-primary-light w-full rounded-md border bg-white px-2 py-1 text-[13px] outline-none"
                />
              </form>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => open(c.id)}
                  className={cn(
                    'focus-visible:ring-ring/50 block w-full truncate rounded-md py-1 pr-12 pl-2 text-left text-[13px] outline-none focus-visible:ring-2',
                    view === 'chat' && activeId === c.id
                      ? 'text-primary bg-accent font-semibold'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )}
                  title={c.title}
                >
                  {c.title}
                </button>
                <div className="absolute top-0.5 right-1 hidden gap-0.5 group-focus-within:flex group-hover:flex">
                  <button
                    type="button"
                    aria-label={`Rename ${c.title}`}
                    onClick={() => {
                      setEditing(c.id)
                      setTitle(c.title)
                    }}
                    className="text-muted-foreground hover:text-foreground rounded p-1"
                  >
                    <Pencil className="size-3" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${c.title}`}
                    onClick={() => setDeleting(c.id)}
                    className="text-muted-foreground hover:text-destructive rounded p-1"
                  >
                    <Trash2 className="size-3" strokeWidth={2} />
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-[420px]">
          <DialogTitle>Delete this chat?</DialogTitle>
          <DialogDescription className="mt-2">
            It is removed from your workspace. This cannot be undone.
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-3">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={async () => {
                const id = deleting
                setDeleting(null)
                if (!id) return
                if (id === useChat.getState().chatId) useChat.getState().reset()
                await useChats.getState().remove(id)
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
