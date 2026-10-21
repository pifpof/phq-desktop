import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { api, unwrap } from '@/lib/api'
import { isActive } from '@/lib/research'
import { useApp } from '@/store/app'
import { useResearch } from '@/store/research'

/**
 * "<N> new files added. Update the playbook with them?" (REQUIREMENTS-v4.4 4.4), once the run that
 * was going when they were added has finished. Adds them as customer references, then opens the
 * v3.1 preview for the proof section.
 */
export function HeldPrompt({ className }: { className?: string }) {
  const active = useResearch((s) => isActive(s.run))
  const [count, setCount] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (active) return
    void unwrap(api.heldFiles())
      .then((r) => setCount(r.names.length))
      .catch(() => undefined)
  }, [active])
  if (active || count === 0) return null
  return (
    <div className={className}>
      <p className="text-sm">
        {count} new {count === 1 ? 'file' : 'files'} added. Update the playbook with{' '}
        {count === 1 ? 'it' : 'them'}?
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await unwrap(api.addHeldFiles())
            setCount(0)
            useApp.getState().openRegenerate('proof-points')
          } finally {
            setBusy(false)
          }
        }}
      >
        Update the playbook
      </Button>
    </div>
  )
}
