import { CircleDashed } from 'lucide-react'
import type { TreeNode } from '@shared/wiki-tree'
import { Button } from '@/components/ui/button'

/** An article the map expects but the wiki doesn't have yet (REQUIREMENTS-v3 3.5). */
export function PlaceholderPane({
  node,
  running,
  onGenerate
}: {
  node: TreeNode
  running: boolean
  onGenerate: (taskId: string) => void
}) {
  const name = node.label === 'Not generated yet' ? 'These articles' : node.label
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-[420px] text-center">
        <CircleDashed className="text-muted-foreground mx-auto size-8" strokeWidth={1.5} />
        <h3 className="mt-3 text-[20px]">Not generated yet</h3>
        <p className="text-muted-foreground mt-2 text-sm">
          {name} {name === 'These articles' ? 'are' : 'is'} part of the wiki but hasn&apos;t been
          written yet.{' '}
          {node.taskId
            ? 'Generate runs just the research step that writes it.'
            : 'The app writes it for you.'}
        </p>
        {node.taskId && (
          <Button className="mt-5" disabled={running} onClick={() => onGenerate(node.taskId!)}>
            Generate
          </Button>
        )}
        {running && (
          <p className="text-muted-foreground mt-2 text-[13px]">
            Research is running. Try again when it finishes.
          </p>
        )}
      </div>
    </div>
  )
}
