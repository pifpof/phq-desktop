import type { ModeId } from '@shared/types'
import type { PromptBlock } from '../providers/types'
import { generalPrompt } from './general'
import { workspaceContext, type ModeContext, type WorkspaceModeDeps } from './workspace'

export interface Mode {
  title: string
  /**
   * Built in the main process for each question. The renderer never sends a system prompt.
   * Returns the prompt and the wiki articles it is grounded in.
   */
  context(deps: WorkspaceModeDeps): Promise<ModeContext>
}

export const modes: Record<ModeId, Mode> = {
  general: { title: 'General', context: async () => ({ system: generalPrompt, sources: [] }) },
  workspace: { title: 'Your workspace', context: workspaceContext }
}

export type { PromptBlock }
