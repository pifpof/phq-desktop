export const WIZARD_STEPS = [
  'connect',
  'verify',
  'workspace',
  'company',
  'about',
  'goals',
  'loop',
  'files',
  'start'
] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]

export const WIZARD_TOTAL = WIZARD_STEPS.length
export const stepNumber = (s: WizardStep): number => WIZARD_STEPS.indexOf(s) + 1

/** Steps that collect company information, in order. */
export const PROFILE_STEPS: readonly WizardStep[] = [
  'company',
  'about',
  'goals',
  'loop',
  'files',
  'start'
]
export const isProfileStep = (s: string): s is WizardStep => PROFILE_STEPS.includes(s as WizardStep)
