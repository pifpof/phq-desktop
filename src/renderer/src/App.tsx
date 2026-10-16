import { useEffect } from 'react'
import { useApp } from '@/store/app'
import { ChatScreen } from '@/features/chat/ChatScreen'
import { ConnectAI } from '@/features/onboarding/ConnectAI'
import { Done } from '@/features/onboarding/Done'
import { Verify } from '@/features/onboarding/Verify'
import { Welcome } from '@/features/onboarding/Welcome'
import { Workspace } from '@/features/onboarding/Workspace'
import { SettingsSheet } from '@/features/settings/SettingsSheet'

export default function App() {
  const step = useApp((s) => s.step)
  const ready = useApp((s) => s.state !== null)
  const loadError = useApp((s) => s.loadError)

  useEffect(() => {
    void useApp.getState().init()
  }, [])

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="text-muted-foreground">
          Something went wrong starting PositioningHQ. Please restart the app.
        </p>
      </div>
    )
  }
  if (!ready) return null

  return (
    <>
      {step === 'welcome' && <Welcome />}
      {step === 'connect' && <ConnectAI />}
      {step === 'verify' && <Verify />}
      {step === 'workspace' && <Workspace />}
      {step === 'done' && <Done />}
      {step === 'chat' && <ChatScreen />}
      <SettingsSheet />
    </>
  )
}
