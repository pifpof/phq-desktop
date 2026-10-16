import { z } from 'zod'
import { APP_ERROR_CODES, type ErrorCode } from './errors'
import { ProfileSchema } from './profile'
import {
  AddResultSchema,
  DetectionSchema,
  DocMetaSchema,
  DocSchema,
  InputCategorySchema,
  InputFileSchema
} from './workspace'

export const ErrorCodeSchema = z.enum(APP_ERROR_CODES)

export const ResultSchema = <T extends z.ZodType>(data: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data }),
    z.object({
      ok: z.literal(false),
      error: z.object({ code: ErrorCodeSchema, message: z.string() })
    })
  ])

export type Result<T> =
  { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } }

export const ModelInfoSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  createdAt: z.string()
})

export const AppStateSchema = z.object({
  route: z.enum(['welcome', 'connect', 'workspace', 'chat']),
  note: z.string().nullable(),
  provider: z.enum(['anthropic', 'openai', 'gemini']),
  model: z.string().nullable(),
  modelName: z.string().nullable(),
  workspacePath: z.string().nullable(),
  defaultWorkspacePath: z.string(),
  maskedKey: z.string().nullable(),
  appVersion: z.string(),
  secureStorage: z.boolean(),
  revealLabel: z.string(),
  platform: z.enum(['mac', 'other'])
})

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(200_000)
})

export const ChatStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({
    type: z.literal('usage'),
    usage: z.object({ inputTokens: z.number(), outputTokens: z.number() })
  }),
  z.object({ type: z.literal('done'), stopped: z.boolean() }),
  z.object({ type: z.literal('error'), code: ErrorCodeSchema, message: z.string() })
])

const WorkspaceInfoSchema = z.object({ path: z.string(), existing: z.boolean() })

const ModelsResultSchema = z.object({
  models: z.array(ModelInfoSchema),
  defaultModelId: z.string().nullable()
})

/** Every invoke channel: request schema and response data schema. Single source of truth. */
export const channels = {
  'app:getState': { req: z.undefined(), res: AppStateSchema },
  'provider:verifyKey': {
    req: z.object({ key: z.string().min(1).max(512) }),
    res: ModelsResultSchema.extend({ persisted: z.boolean() })
  },
  'provider:listModels': { req: z.undefined(), res: ModelsResultSchema },
  'settings:setModel': {
    req: z.object({ model: z.string().min(1).max(200), displayName: z.string().max(200) }),
    res: z.null()
  },
  'workspace:chooseFolder': { req: z.undefined(), res: WorkspaceInfoSchema.nullable() },
  'workspace:useDefault': { req: z.undefined(), res: WorkspaceInfoSchema },
  'workspace:confirm': {
    req: z.object({ path: z.string().min(1).max(4096) }),
    res: WorkspaceInfoSchema
  },
  'workspace:reveal': { req: z.undefined(), res: z.null() },
  'workspace:detect': {
    req: z.object({ path: z.string().min(1).max(4096) }),
    res: DetectionSchema
  },
  'profile:get': { req: z.undefined(), res: ProfileSchema.nullable() },
  'profile:save': { req: ProfileSchema, res: z.null() },
  'docs:list': {
    req: z.object({ dir: z.string().max(500).optional() }),
    res: z.array(DocMetaSchema)
  },
  'docs:read': { req: z.object({ path: z.string().min(1).max(500) }), res: DocSchema.nullable() },
  'inputs:list': {
    req: z.undefined(),
    res: z.record(InputCategorySchema, z.array(InputFileSchema))
  },
  'inputs:add': {
    req: z.object({
      category: InputCategorySchema,
      paths: z.array(z.string().max(4096)).min(1).max(100)
    }),
    res: AddResultSchema
  },
  'inputs:browse': { req: z.object({ category: InputCategorySchema }), res: AddResultSchema },
  'inputs:remove': {
    req: z.object({ category: InputCategorySchema, name: z.string().min(1).max(255) }),
    res: z.null()
  },
  'net:checkUrl': {
    req: z.object({ url: z.string().max(2048) }),
    res: z.object({ reachable: z.boolean(), finalUrl: z.string().nullable() })
  },
  'docs:openInEditor': { req: z.object({ path: z.string().min(1).max(500) }), res: z.null() },
  'chat:start': {
    req: z.object({
      modeId: z.enum(['general']),
      messages: z.array(ChatMessageSchema).min(1).max(500)
    }),
    res: z.object({ streamId: z.string() })
  },
  'chat:cancel': { req: z.object({ streamId: z.string() }), res: z.null() },
  'secrets:disconnect': { req: z.undefined(), res: z.null() },
  'shell:openExternal': { req: z.object({ url: z.string().max(2048) }), res: z.null() }
} as const

export type ChannelName = keyof typeof channels
export type Req<C extends ChannelName> = z.infer<(typeof channels)[C]['req']>
export type Res<C extends ChannelName> = z.infer<(typeof channels)[C]['res']>

/** Push channels, main to renderer. */
export const EVENT_CHAT = 'chat:event'
export const EVENT_OPEN_SETTINGS = 'menu:openSettings'
export const EVENT_WORKSPACE_CHANGED = 'workspace:changed'

export const WorkspaceChangedSchema = z.object({ paths: z.array(z.string()) })
export type WorkspaceChanged = z.infer<typeof WorkspaceChangedSchema>

export const ChatEnvelopeSchema = z.object({ streamId: z.string(), event: ChatStreamEventSchema })
export type ChatEnvelope = z.infer<typeof ChatEnvelopeSchema>

/** Shape of `window.api`. */
export interface Api {
  getState(): Promise<Result<Res<'app:getState'>>>
  verifyKey(key: string): Promise<Result<Res<'provider:verifyKey'>>>
  listModels(): Promise<Result<Res<'provider:listModels'>>>
  setModel(model: string, displayName: string): Promise<Result<null>>
  chooseFolder(): Promise<Result<Res<'workspace:chooseFolder'>>>
  useDefaultFolder(): Promise<Result<Res<'workspace:useDefault'>>>
  confirmWorkspace(path: string): Promise<Result<Res<'workspace:confirm'>>>
  revealWorkspace(): Promise<Result<null>>
  detectWorkspace(path: string): Promise<Result<Res<'workspace:detect'>>>
  getProfile(): Promise<Result<Res<'profile:get'>>>
  saveProfile(profile: Req<'profile:save'>): Promise<Result<null>>
  listDocs(dir?: string): Promise<Result<Res<'docs:list'>>>
  readDoc(path: string): Promise<Result<Res<'docs:read'>>>
  openDoc(path: string): Promise<Result<null>>
  listInputs(): Promise<Result<Res<'inputs:list'>>>
  addInputs(
    category: Req<'inputs:add'>['category'],
    paths: string[]
  ): Promise<Result<Res<'inputs:add'>>>
  browseInputs(category: Req<'inputs:browse'>['category']): Promise<Result<Res<'inputs:browse'>>>
  removeInput(category: Req<'inputs:remove'>['category'], name: string): Promise<Result<null>>
  checkUrl(url: string): Promise<Result<Res<'net:checkUrl'>>>
  /** Real path of a dropped File. Only the preload can read this. */
  getFilePath(file: File): string
  startChat(args: Req<'chat:start'>): Promise<Result<Res<'chat:start'>>>
  cancelChat(streamId: string): Promise<Result<null>>
  disconnect(): Promise<Result<null>>
  openExternal(url: string): Promise<Result<null>>
  onChatEvent(cb: (e: ChatEnvelope) => void): () => void
  onOpenSettings(cb: () => void): () => void
  onWorkspaceChanged(cb: (e: WorkspaceChanged) => void): () => void
}
