import type { Profile } from '@shared/profile'

/** Starter prompts for the workspace mode, chosen by the goals the founder picked (REQUIREMENTS-v1 4.2). */
export function goalStarters(profile: Profile | null): string[] {
  const rival = profile?.company.competitors[0] ?? 'our top competitor'
  const byGoal: Record<string, string> = {
    positioning: 'What is our positioning statement, and how would you tighten it?',
    messaging: 'Rewrite our homepage hero using the playbook.',
    competitors: `How do we win against ${rival}?`,
    sales: 'Write a 30-second pitch our sales team can use.',
    launch: 'Draft launch messaging for our next release, based on the playbook.',
    'ai-context': 'Summarise our positioning in 150 words for our AI tools.',
    fundraising: 'Turn our positioning into a two-sentence investor story.'
  }
  const order = [...(profile?.goals ?? []), 'positioning', 'messaging', 'competitors']
  return [...new Set(order.map((g) => byGoal[g]).filter(Boolean))].slice(0, 3)
}
