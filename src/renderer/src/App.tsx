import { useEffect } from 'react'
import { useApp } from '@/store/app'
import { useResearch } from '@/store/research'
import { AboutYouStep } from '@/features/onboarding/AboutYouStep'
import { CompanyStep } from '@/features/onboarding/CompanyStep'
import { ConnectAI } from '@/features/onboarding/ConnectAI'
import { FilesStep } from '@/features/onboarding/FilesStep'
import { GoalsStep } from '@/features/onboarding/GoalsStep'
import { StartResearchStep } from '@/features/onboarding/StartResearchStep'
import { StayInLoopStep } from '@/features/onboarding/StayInLoopStep'
import { Verify } from '@/features/onboarding/Verify'
import { Welcome } from '@/features/onboarding/Welcome'
import { Workspace } from '@/features/onboarding/Workspace'
import { PauseDialog } from '@/features/research/PauseDialog'
import { SettingsSheet } from '@/features/settings/SettingsSheet'
import { HomeShell } from '@/features/shell/HomeShell'

export default function App() {
  const step = useApp((s) => s.step)
  const ready = useApp((s) => s.state !== null)
  const loadError = useApp((s) => s.loadError)

  useEffect(() => {
    void useApp.getState().init()
  }, [])

  // Research runs in the main process. Follow it from anywhere in the app.
  useEffect(() => {
    const off = useResearch.getState().subscribe()
    return off
  }, [])
  useEffect(() => {
    if (step === 'home') void useResearch.getState().load()
  }, [step])

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
      {step === 'company' && <CompanyStep />}
      {step === 'about' && <AboutYouStep />}
      {step === 'goals' && <GoalsStep />}
      {step === 'loop' && <StayInLoopStep />}
      {step === 'files' && <FilesStep />}
      {step === 'start' && <StartResearchStep />}
      {step === 'home' && <HomeShell />}
      <SettingsSheet />
      <PauseDialog />
    </>
  )
}
