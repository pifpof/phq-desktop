import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const LINE = 24
const MAX_LINES = 8

export interface ComposerHandle {
  fill(text: string): void
}

interface Props {
  streaming: boolean
  onSend: (text: string) => void
  onStop: () => void
}

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { streaming, onSend, onStop },
  handle
) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useImperativeHandle(handle, () => ({
    fill(text) {
      setValue(text)
      ref.current?.focus()
    }
  }))

  // Auto-grow up to 8 lines.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, LINE * MAX_LINES)}px`
  }, [value])

  const submit = (): void => {
    if (!value.trim() || streaming) return
    onSend(value)
    setValue('')
  }

  return (
    <div className="bg-muted border-t px-6 py-4">
      <div className="focus-within:border-primary-light focus-within:ring-ring/50 mx-auto flex max-w-[760px] items-end gap-3 rounded-xl border bg-white p-2 pl-4 transition-shadow focus-within:ring-[3px]">
        <Textarea
          ref={ref}
          rows={1}
          autoFocus
          value={value}
          aria-label="Message"
          placeholder="Write a message"
          className="max-h-48 flex-1 py-2"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
        />
        {streaming ? (
          <Button onClick={onStop} aria-label="Stop">
            <Square className="fill-current" strokeWidth={1.8} />
            Stop
          </Button>
        ) : (
          <Button onClick={submit} disabled={!value.trim()} aria-label="Send">
            <ArrowUp strokeWidth={1.8} />
            Send
          </Button>
        )}
      </div>
    </div>
  )
})
