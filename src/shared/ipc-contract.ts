import { z } from 'zod'
import { ErrorCodeSchema, type ErrorCode } from './errors'
import { ChatIdSchema, ChatRecordSchema, ChatSummarySchema } from './chat'
import { CheckReportSchema, FixReportSchema } from './conformance'
import { ProfileSchema } from './profile'
import { RunViewSchema, type RunView } from './research'
import {
  AddResultSchema,
  DetectionSchema,
  DocMetaSchema,
  DocSchema,
  InputCategorySchema,
  InputFileSchema
} from './workspace'

export { ErrorCodeSchema }

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
  createdAt: z.string(),
  webSearch: z.boolean().optional()
})

export const AppStateSchema = z.object({
  route: z.enum(['welcome', 'connect', 'workspace', 'home']),
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
  openResearchLinks: z.boolean(),
  workspaceStatus: z.enum(['ok', 'read-only', 'needs-migration', 'other-wiki']).nullable(),
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
  // Dev-only: run local ingestion directly. Refused in packaged builds. Replaced by the task engine in Phase 5.
  'research:estimate': {
    req: z.undefined(),
    res: z.object({
      costUsd: z.object({ low: z.number(), high: z.number() }),
      minutes: z.object({ low: z.number(), high: z.number() }),
      searches: z.object({ low: z.number(), high: z.number() }),
      tasks: z.number(),
      model: z.string(),
      modelKnown: z.boolean(),
      webSearch: z.boolean().nullable(),
      concurrency: z.number(),
      budgetCapUsd: z.number(),
      pricingUpdated: z.string()
    })
  },
  'research:start': {
    req: z.object({
      budgetCapUsd: z.number().min(0.01).max(10_000).optional(),
      concurrency: z.number().int().min(1).max(6).optional()
    }),
    res: RunViewSchema
  },
  'research:getRun': { req: z.undefined(), res: RunViewSchema.nullable() },
  'research:pause': { req: z.undefined(), res: z.null() },
  'research:resume': {
    req: z.object({
      skipWeb: z.boolean().optional(),
      budgetCapUsd: z.number().min(0.01).max(10_000).optional()
    }),
    res: z.null()
  },
  'research:cancel': { req: z.undefined(), res: z.null() },
  'research:retryTask': { req: z.object({ taskId: z.string().min(1).max(200) }), res: z.null() },
  'research:rerun': {
    req: z.object({
      taskIds: z.array(z.string().min(1).max(200)).max(50).optional(),
      preset: z.enum(['playbook']).optional()
    }),
    res: RunViewSchema
  },
  'research:catalog': {
    req: z.undefined(),
    res: z.array(
      z.object({ taskId: z.string(), title: z.string(), path: z.string(), stage: z.number() })
    )
  },
  'research:setBudget': {
    req: z.object({ budgetCapUsd: z.number().min(0.01).max(10_000) }),
    res: z.null()
  },
  'dev:runStep': {
    req: z.object({
      step: z.enum(['01', '02', '03', '04', '05', '06', '07']),
      web: z.boolean().optional()
    }),
    res: z.object({
      text: z.string(),
      citations: z.array(z.object({ url: z.string(), title: z.string() })),
      consulted: z.array(z.object({ url: z.string(), title: z.string() })),
      stopReason: z.string(),
      usage: z.object({
        inputTokens: z.number(),
        outputTokens: z.number(),
        cacheReadTokens: z.number(),
        cacheWriteTokens: z.number(),
        webSearchRequests: z.number(),
        webFetchRequests: z.number(),
        requests: z.number()
      }),
      costUsd: z.number(),
      costApproximate: z.boolean(),
      model: z.string()
    })
  },
  'docs:copy': { req: z.object({ path: z.string().min(1).max(500) }), res: z.null() },
  'docs:changedSince': {
    req: z.object({ since: z.string().max(64) }),
    res: z.object({ profile: z.boolean(), inputs: z.boolean() })
  },
  'social:setTagline': {
    req: z.object({ network: z.string().min(1).max(60), text: z.string().min(1).max(500) }),
    res: z.null()
  },
  'shell:openSource': {
    req: z.object({ url: z.string().max(2048), path: z.string().min(1).max(500) }),
    res: z.null()
  },
  'settings:allowResearchLinks': { req: z.undefined(), res: z.null() },
  'docs:reveal': { req: z.object({ path: z.string().min(1).max(500) }), res: z.null() },
  'docs:openInEditor': { req: z.object({ path: z.string().min(1).max(500) }), res: z.null() },
  'chat:start': {
    req: z.object({
      modeId: z.enum(['general', 'workspace']),
      messages: z.array(ChatMessageSchema).min(1).max(500)
    }),
    res: z.object({ streamId: z.string() })
  },
  'chats:list': { req: z.undefined(), res: z.array(ChatSummarySchema) },
  'chats:get': { req: z.object({ id: ChatIdSchema }), res: ChatRecordSchema.nullable() },
  'chats:save': { req: ChatRecordSchema, res: z.null() },
  'chats:rename': {
    req: z.object({ id: ChatIdSchema, title: z.string().min(1).max(200) }),
    res: z.null()
  },
  'chats:delete': { req: z.object({ id: ChatIdSchema }), res: z.null() },
  'chat:cancel': { req: z.object({ streamId: z.string() }), res: z.null() },
  'wiki:check': { req: z.undefined(), res: CheckReportSchema },
  'hub:get': {
    req: z.undefined(),
    res: z
      .object({
        hubPath: z.string(),
        topicsPath: z.string(),
        /** The current workspace sits directly inside <hub>/topics/. */
        insideHub: z.boolean(),
        registered: z.boolean()
      })
      .nullable()
  },
  'workspace:useHub': {
    req: z.object({ name: z.string().trim().min(1).max(80) }),
    res: WorkspaceInfoSchema
  },
  'hub:register': { req: z.undefined(), res: z.null() },
  'wiki:fix': { req: z.undefined(), res: FixReportSchema },
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
export const EVENT_RESEARCH = 'research:event'

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
  revealDoc(path: string): Promise<Result<null>>
  copyDoc(path: string): Promise<Result<null>>
  changedSince(since: string): Promise<Result<Res<'docs:changedSince'>>>
  setSocialTagline(network: string, text: string): Promise<Result<null>>
  openSource(url: string, path: string): Promise<Result<null>>
  allowResearchLinks(): Promise<Result<null>>
  rerunResearch(target: Req<'research:rerun'>): Promise<Result<Res<'research:rerun'>>>
  researchCatalog(): Promise<Result<Res<'research:catalog'>>>
  listInputs(): Promise<Result<Res<'inputs:list'>>>
  addInputs(
    category: Req<'inputs:add'>['category'],
    paths: string[]
  ): Promise<Result<Res<'inputs:add'>>>
  browseInputs(category: Req<'inputs:browse'>['category']): Promise<Result<Res<'inputs:browse'>>>
  removeInput(category: Req<'inputs:remove'>['category'], name: string): Promise<Result<null>>
  estimateResearch(): Promise<Result<Res<'research:estimate'>>>
  startResearch(options?: Req<'research:start'>): Promise<Result<Res<'research:start'>>>
  getResearchRun(): Promise<Result<Res<'research:getRun'>>>
  pauseResearch(): Promise<Result<null>>
  resumeResearch(options?: Req<'research:resume'>): Promise<Result<null>>
  cancelResearch(): Promise<Result<null>>
  retryResearchTask(taskId: string): Promise<Result<null>>
  setResearchBudget(budgetCapUsd: number): Promise<Result<null>>
  devRunStep(req: Req<'dev:runStep'>): Promise<Result<Res<'dev:runStep'>>>
  checkUrl(url: string): Promise<Result<Res<'net:checkUrl'>>>
  /** Real path of a dropped File. Only the preload can read this. */
  getFilePath(file: File): string
  startChat(args: Req<'chat:start'>): Promise<Result<Res<'chat:start'>>>
  cancelChat(streamId: string): Promise<Result<null>>
  listChats(): Promise<Result<Res<'chats:list'>>>
  getChat(id: string): Promise<Result<Res<'chats:get'>>>
  saveChat(chat: Req<'chats:save'>): Promise<Result<null>>
  renameChat(id: string, title: string): Promise<Result<null>>
  deleteChat(id: string): Promise<Result<null>>
  checkWiki(): Promise<Result<Res<'wiki:check'>>>
  getHub(): Promise<Result<Res<'hub:get'>>>
  useHubFolder(name: string): Promise<Result<Res<'workspace:useHub'>>>
  registerInHub(): Promise<Result<null>>
  fixWiki(): Promise<Result<Res<'wiki:fix'>>>
  disconnect(): Promise<Result<null>>
  openExternal(url: string): Promise<Result<null>>
  onChatEvent(cb: (e: ChatEnvelope) => void): () => void
  onOpenSettings(cb: () => void): () => void
  onWorkspaceChanged(cb: (e: WorkspaceChanged) => void): () => void
  onResearchEvent(cb: (run: RunView) => void): () => void
}
