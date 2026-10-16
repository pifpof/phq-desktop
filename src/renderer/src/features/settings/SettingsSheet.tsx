import { useEffect, useState } from 'react'
import { ExternalLink, FolderOpen } from 'lucide-react'
import type { ModelInfo } from '@shared/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { api, openExternal, unwrap } from '@/lib/api'
import { useApp } from '@/store/app'
import { useChat } from '@/store/chat'
import { useResearch } from '@/store/research'
import { isActive } from '@/lib/research'

const REPO_URL = 'https://github.com/parallel79/positioninghq-desktop'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b py-5 first:pt-0 last:border-b-0 last:pb-0">
      <h3 className="mb-3 text-[17px]">{title}</h3>
      {children}
    </section>
  )
}

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => openExternal(href)}
      className="text-primary hover:text-primary-hover inline-flex items-center gap-1 text-sm underline underline-offset-2"
    >
      {children}
      <ExternalLink className="size-3.5" strokeWidth={1.8} />
    </button>
  )
}

export function SettingsSheet() {
  const open = useApp((s) => s.settingsOpen)
  const state = useApp((s) => s.state)
  const researchActive = useResearch((s) => isActive(s.run))
  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelError, setModelError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  // Refresh the models list each time the sheet opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    unwrap(api.listModels())
      .then((r) => {
        if (cancelled) return
        setModels(r.models)
        setModelError(null)
      })
      .catch((err: Error) => {
        if (!cancelled) setModelError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => api.onOpenSettings(() => useApp.getState().setSettingsOpen(true)), [])

  const changeModel = async (id: string): Promise<void> => {
    const m = models.find((x) => x.id === id)
    if (!m) return
    await api.setModel(m.id, m.displayName)
    await useApp.getState().refresh()
  }

  const disconnect = async (): Promise<void> => {
    await api.disconnect()
    useChat.getState().reset()
    setConfirming(false)
    await useApp.getState().afterDisconnect()
  }

  const selected = models.find((m) => m.id === state?.model)

  return (
    <>
      <Dialog open={open && !confirming} onOpenChange={(o) => useApp.getState().setSettingsOpen(o)}>
        <DialogContent className="max-w-[520px]">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Manage your AI connection, model and workspace.
          </DialogDescription>
          <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
            <Section title="AI connection">
              <dl className="text-sm">
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">Provider</dt>
                  <dd className="font-semibold">Claude (Anthropic)</dd>
                </div>
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">Key</dt>
                  <dd className="font-mono text-[13px]">{state?.maskedKey ?? 'Not connected'}</dd>
                </div>
              </dl>
              <div className="mt-4 flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => useApp.getState().startFlow('replaceKey')}
                >
                  Replace key
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-destructive/50 text-destructive hover:bg-destructive/5"
                  onClick={() => setConfirming(true)}
                >
                  Disconnect
                </Button>
              </div>
            </Section>

            <Section title="Model">
              <Label htmlFor="settings-model" className="sr-only">
                Model
              </Label>
              <Select
                value={selected?.id ?? ''}
                onValueChange={(v) => void changeModel(v)}
                disabled={models.length === 0}
              >
                <SelectTrigger id="settings-model" />
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {modelError ? (
                <p className="text-destructive mt-2 text-[13px]">{modelError}</p>
              ) : (
                <p className="text-muted-foreground mt-2 text-[13px]">
                  A new model applies from your next message.
                </p>
              )}
            </Section>

            <Section title="Workspace">
              <p className="text-sm break-all">{state?.workspacePath}</p>
              <div className="mt-4 flex gap-3">
                <Button variant="outline" size="sm" onClick={() => void api.revealWorkspace()}>
                  <FolderOpen strokeWidth={1.8} />
                  {state?.revealLabel ?? 'Show in Finder'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={researchActive}
                  onClick={() => useApp.getState().startFlow('changeFolder')}
                >
                  Change folder
                </Button>
              </div>
              {researchActive && (
                <p className="text-muted-foreground mt-2 text-[13px]">
                  Research is running in this folder. Stop it before changing folders.
                </p>
              )}
            </Section>

            <Section title="About">
              <p className="text-sm">
                PositioningHQ {state?.appVersion}. MIT licence. Made by Parallel79°.
              </p>
              <div className="mt-3 flex gap-5">
                <LinkButton href={REPO_URL}>GitHub</LinkButton>
                <LinkButton href="https://parallel79.com">parallel79.com</LinkButton>
              </div>
            </Section>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="max-w-[440px]">
          <DialogTitle>Disconnect your AI?</DialogTitle>
          <DialogDescription className="mt-2">
            This deletes your key from this computer. Your workspace files are not touched.
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-3">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={() => void disconnect()}
            >
              Disconnect
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
