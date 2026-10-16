import { z } from 'zod'

export const ROLES = [
  'Founder or CEO',
  'Product Marketing',
  'Content Marketing',
  'Marketing Leader (CMO, VP)',
  'Sales Leader (CRO, VP)',
  'Product Management',
  'Other'
] as const

export const COMPANY_SIZES = [
  'Just me',
  '2 to 10',
  '11 to 50',
  '51 to 200',
  '201 to 1,000',
  '1,000+'
] as const

export const GOALS = [
  { id: 'positioning', label: 'Define or refresh our positioning' },
  { id: 'messaging', label: 'Fix our website and messaging' },
  { id: 'competitors', label: 'Understand our competitors' },
  { id: 'sales', label: 'Get sales telling one story' },
  { id: 'launch', label: 'Prepare a product launch' },
  { id: 'ai-context', label: 'Give our AI tools the right context' },
  { id: 'fundraising', label: 'Sharpen our fundraising story' }
] as const

export const GoalIdSchema = z.enum(GOALS.map((g) => g.id) as [string, ...string[]])

/** Everything defaults to empty so a half-finished onboarding can be saved and resumed. */
export const ProfileSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  company: z
    .object({
      name: z.string().max(200).default(''),
      website: z.string().max(500).default(''),
      productName: z.string().max(200).default(''),
      description: z.string().max(1000).default(''),
      competitors: z.array(z.string().max(200)).max(5).default([])
    })
    .default({ name: '', website: '', productName: '', description: '', competitors: [] }),
  user: z
    .object({
      name: z.string().max(200).default(''),
      role: z.string().max(100).default(''),
      roleOther: z.string().max(200).default(''),
      companySize: z.string().max(50).default('')
    })
    .default({ name: '', role: '', roleOther: '', companySize: '' }),
  goals: z.array(GoalIdSchema).default([]),
  updates: z
    .object({
      prompted: z.boolean().default(false),
      clicked: z.boolean().default(false),
      /** The second ask, after the first Messaging Analysis, has been shown (it is shown once). */
      secondPromptShown: z.boolean().default(false)
    })
    .default({ prompted: false, clicked: false, secondPromptShown: false }),
  onboarding: z
    .object({
      /** Last wizard step reached, so quitting mid-onboarding resumes there. */
      step: z.string().default(''),
      complete: z.boolean().default(false)
    })
    .default({ step: '', complete: false })
})

export type Profile = z.infer<typeof ProfileSchema>

export const emptyProfile = (): Profile => ProfileSchema.parse({})
