import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import type { ModelInfo } from '@shared/types'
import { isRetryable, type ErrorCode } from '@shared/errors'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { api, ApiError, unwrap } from '@/lib/api'
import { useApp } from '@/store/app'
import { WizardShell } from './WizardShell'

type View =
  | { kind: 'checking' }
  | { kind: 'error'; code: ErrorCode; message: string }
  | { kind: 'ok'; models: ModelInfo[]; selected: string; persisted: boolean }

export function Verify() {
  const { flow, pendingKey } = useApp()
  const secureStorage = useApp((s) => s.state?.secureStorage ?? true)
  const [view, setView] = useState<View>({ kind: 'checking' })
  const started = useRef(false)

  // Resolves to the view to show. Kept free of setState so effects can call it.
  const check = useCallback(async (key: string): Promise<View> => {
    try {
      const res = await unwrap(api.verifyKey(key))
      // The key is now saved in the main process. The renderer no longer needs it.
      useApp.getState().setPendingKey('')
      return {
        kind: 'ok',
        models: res.models,
        selected: res.defaultModelId ?? '',
        persisted: res.persisted
      }
    } catch (err) {
      const e = err instanceof ApiError ? err : null
      return {
        kind: 'error',
        code: (e?.code as ErrorCode) ?? 'internal',
        message: e?.message ?? 'Something went wrong. Please try again.'
      }
    }
  }, [])

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (!pendingKey) {
      useApp.getState().go('connect')
      return
    }
    void check(pendingKey).then(setView)
  }, [pendingKey, check])

  const retry = (): void => {
    setView({ kind: 'checking' })
    void check(pendingKey).then(setView)
  }

  const back = (): void => useApp.getState().go('connect')

  const cont = async (): Promise<void> => {
    if (view.kind !== 'ok') return
    const model = view.models.find((m) => m.id === view.selected)
    if (model) await api.setModel(model.id, model.displayName)
    await useApp.getState().refresh()
    if (flow === 'wizard') useApp.getState().go('workspace')
    else await useApp.getState().endFlow()
  }

  return (
    <WizardShell step={flow === 'wizard' ? 2 : null} onBack={view.kind === 'ok' ? undefined : back}>
      {view.kind === 'checking' && (
        <div role="status" className="py-6">
          <Loader2 className="text-primary size-7 animate-spin" strokeWidth={1.8} />
          <h2 className="mt-5">Checking your key...</h2>
          <p className="lede mt-3">
            We send one tiny test message to confirm your account has credit.
          </p>
        </div>
      )}

      {view.kind === 'error' && (
        <div role="alert">
          <h2>Couldn&apos;t connect</h2>
          <p className="lede mt-3">{view.message}</p>
          <div className="mt-8 flex gap-3">
            {isRetryable(view.code) || view.code === 'no_credit' ? (
              <Button autoFocus onClick={retry} disabled={!pendingKey}>
                {view.code === 'no_credit' ? 'Check again' : 'Retry'}
              </Button>
            ) : null}
            <Button variant="outline" onClick={back}>
              Enter a different key
            </Button>
          </div>
        </div>
      )}

      {view.kind === 'ok' && (
        <div>
          <CheckCircle2 className="text-primary size-7" strokeWidth={1.8} />
          <h2 className="mt-5">Connected.</h2>
          <p className="lede mt-3">Choose the model PositioningHQ should use.</p>
          <div className="mt-6">
            <Label htmlFor="model">Model</Label>
            <div className="mt-2">
              <Select
                value={view.selected}
                onValueChange={(selected) => setView({ ...view, selected })}
              >
                <SelectTrigger id="model" autoFocus />
                <SelectContent>
                  {view.models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {(!view.persisted || !secureStorage) && (
            <p className="bg-secondary mt-5 rounded-[10px] px-4 py-3 text-sm">
              Your system has no keyring, so your key can&apos;t be stored securely. It will be kept
              for this session only.
            </p>
          )}
          <Button className="mt-8 w-full" disabled={!view.selected} onClick={() => void cont()}>
            Continue
          </Button>
        </div>
      )}
    </WizardShell>
  )
}
