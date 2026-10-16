import type { ModeId } from '@shared/types'
import { generalPrompt } from './general'

export interface Mode {
  title: string
  systemPrompt: string
}

export const modes: Record<ModeId, Mode> = {
  general: { title: 'General', systemPrompt: generalPrompt }
}
