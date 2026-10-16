import type { ModeId } from '@shared/types'
import type { PromptBlock } from '../providers/types'
import { generalPrompt } from './general'
import { workspaceSystem, type WorkspaceModeDeps } from './workspace'

export interface Mode {
  title: string
  /** Built in the main process for each conversation. The renderer never sends a system prompt. */
  system(deps: WorkspaceModeDeps): Promise<string | PromptBlock[]>
}

export const modes: Record<ModeId, Mode> = {
  general: { title: 'General', system: async () => generalPrompt },
  workspace: { title: 'Your workspace', system: workspaceSystem }
}
