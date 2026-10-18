import { INPUT_CATEGORIES } from '@shared/workspace'
import { Button } from '@/components/ui/button'
import { DropZone } from '@/features/onboarding/FilesStep'
import { useInputs } from '@/features/onboarding/useInputs'
import { useResearch } from '@/store/research'
import { useApp } from '@/store/app'

export function FilesPane() {
  const { files, messages, total, add, browse, remove } = useInputs()
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[680px] px-6 py-8">
        <h2 className="text-[22px]">Your files</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {total} {total === 1 ? 'file' : 'files'}. Files marked "not read" are kept but not used.
          New files are used the next time the playbook is written.
        </p>
        <div className="mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await useResearch.getState().rerun({ preset: 'playbook' })
              useApp.getState().go('progress')
            }}
          >
            Regenerate playbook with these files
          </Button>
        </div>
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
      </div>
    </div>
  )
}
