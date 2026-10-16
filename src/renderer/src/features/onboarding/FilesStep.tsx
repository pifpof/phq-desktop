import { useState } from 'react'
import { FileText, Upload, X } from 'lucide-react'
import { INPUT_CATEGORIES, type InputCategory, type InputFile } from '@shared/workspace'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { stepNumber } from './steps'
import { useInputs } from './useInputs'
import { WizardShell } from './WizardShell'

export const HINTS: Record<InputCategory, string> = {
  'sales collateral': 'Pitch deck, sales deck, one-pagers',
  'customer references': 'Case studies, testimonials, quotes',
  'competitive-intel': 'Competitor teardowns, win/loss notes, analyst reports',
  'company strategy': 'Board or investor decks, strategy docs',
  roadmap: 'Roadmap, release notes',
  'help-docs': 'Product docs, FAQs'
}

export const LABELS: Record<InputCategory, string> = {
  'sales collateral': 'Sales collateral',
  'customer references': 'Customer references',
  'competitive-intel': 'Competitive intel',
  'company strategy': 'Company strategy',
  roadmap: 'Roadmap',
  'help-docs': 'Help docs'
}

const size = (n: number): string =>
  n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`

interface ZoneProps {
  category: InputCategory
  files: InputFile[]
  message: string | null
  onDropFiles: (paths: string[]) => void
  onBrowse: () => void
  onRemove: (name: string) => void
}

export function DropZone({ category, files, message, onDropFiles, onBrowse, onRemove }: ZoneProps) {
  const [over, setOver] = useState(false)
  return (
    <div
      data-testid={`zone-${category}`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const paths = [...e.dataTransfer.files].map((f) => api.getFilePath(f)).filter(Boolean)
        if (paths.length) onDropFiles(paths)
      }}
      className={cn(
        'rounded-xl border border-dashed p-4 transition-colors',
        over ? 'border-primary-light bg-accent' : 'bg-white'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{LABELS[category]}</p>
          <p className="text-muted-foreground text-sm">{HINTS[category]}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onBrowse}>
          <Upload strokeWidth={1.8} />
          Add
        </Button>
      </div>
      {files.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {files.map((f) => (
            <li
              key={f.name}
              className="bg-secondary flex max-w-full items-center gap-1.5 rounded-lg py-1 pr-1 pl-2.5 text-[13px]"
            >
              <FileText className="text-muted-foreground size-3.5 shrink-0" strokeWidth={1.8} />
              <span className="truncate">{f.name}</span>
              <span className="text-muted-foreground shrink-0">{size(f.size)}</span>
              {!f.readable && <span className="text-muted-foreground shrink-0">· not read</span>}
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => onRemove(f.name)}
                className="hover:bg-border focus-visible:ring-ring/50 rounded-md p-1 outline-none focus-visible:ring-2"
              >
                <X className="size-3" strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && (
        <p className="text-destructive mt-2 text-[13px]" role="alert">
          {message}
        </p>
      )}
    </div>
  )
}

export function FilesStep() {
  const { files, messages, add, browse, remove } = useInputs()

  const finish = (): void => void useApp.getState().advance((p) => p, 'start')

  return (
    <WizardShell step={stepNumber('files')} onBack={() => useApp.getState().go('loop')}>
      <h2>Add what you already have</h2>
      <p className="lede mt-3">
        Anything you add makes the playbook more accurate. Files are copied into your workspace and
        never leave this computer, except as text sent to your AI provider during research.
      </p>
      <div className="mt-6 space-y-3">
        {INPUT_CATEGORIES.map((c) => (
          <DropZone
            key={c}
            category={c}
            files={files[c]}
            message={messages[c] ?? null}
            onDropFiles={(paths) => void add(c, paths)}
            onBrowse={() => void browse(c)}
            onRemove={(name) => void remove(c, name)}
          />
        ))}
      </div>
      <div className="mt-8 flex gap-3">
        <Button className="flex-1" onClick={finish}>
          Start research
        </Button>
        <Button className="flex-1" variant="outline" onClick={finish}>
          Skip for now
        </Button>
      </div>
    </WizardShell>
  )
}
