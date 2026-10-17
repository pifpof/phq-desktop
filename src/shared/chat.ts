import { z } from 'zod'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const ChatIdSchema = z.string().regex(UUID)

export const ChatRecordSchema = z.object({
  id: ChatIdSchema,
  title: z.string().max(200),
  modeId: z.enum(['general', 'workspace']),
  createdAt: z.number(),
  updatedAt: z.number(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(200_000),
        status: z.enum(['done', 'stopped']).optional(),
        usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }).optional(),
        /** Wiki articles the answer was grounded in. */
        sources: z
          .array(z.object({ path: z.string().max(500), title: z.string().max(300) }))
          .max(20)
          .optional()
      })
    )
    .max(500)
})
export type ChatRecord = z.infer<typeof ChatRecordSchema>

export const ChatSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.number()
})
export type ChatSummary = z.infer<typeof ChatSummarySchema>

/** A chat's title: its first question, shortened. */
export function chatTitle(firstMessage: string): string {
  const t = firstMessage.replace(/\s+/g, ' ').trim()
  return t.length > 60 ? `${t.slice(0, 57).trimEnd()}...` : t || 'New chat'
}
