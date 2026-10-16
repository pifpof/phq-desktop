export const GENERAL_STARTERS = [
  'Help me describe what my product does in one sentence.',
  'Who are my real competitors, including doing nothing?',
  'What makes my product different, and why should a buyer care?'
]

export function EmptyState({
  onPick,
  starters = GENERAL_STARTERS,
  note
}: {
  onPick: (text: string) => void
  starters?: string[]
  note?: string
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-8">
      <h2 className="text-center">What are you working on?</h2>
      {note && <p className="text-muted-foreground mt-2 text-center text-sm">{note}</p>}
      <div className="mt-8 flex w-full max-w-[560px] flex-col gap-3">
        {starters.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="hover:bg-accent hover:border-primary-light focus-visible:ring-ring/50 rounded-xl border bg-white px-5 py-4 text-left text-[15px] transition-colors outline-none focus-visible:ring-[3px]"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
