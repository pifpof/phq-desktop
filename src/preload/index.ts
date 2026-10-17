import { RunViewSchema } from '@shared/research'
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  ChatEnvelopeSchema,
  EVENT_CHAT,
  EVENT_OPEN_SETTINGS,
  EVENT_RESEARCH,
  EVENT_WORKSPACE_CHANGED,
  WorkspaceChangedSchema,
  type Api,
  type ChannelName
} from '@shared/ipc-contract'

const invoke = <T>(channel: ChannelName, payload?: unknown): Promise<T> =>
  ipcRenderer.invoke(channel, payload)

const api: Api = {
  getState: () => invoke('app:getState'),
  verifyKey: (key) => invoke('provider:verifyKey', { key }),
  listModels: () => invoke('provider:listModels'),
  setModel: (model, displayName) => invoke('settings:setModel', { model, displayName }),
  chooseFolder: () => invoke('workspace:chooseFolder'),
  useDefaultFolder: () => invoke('workspace:useDefault'),
  confirmWorkspace: (path) => invoke('workspace:confirm', { path }),
  revealWorkspace: () => invoke('workspace:reveal'),
  detectWorkspace: (path) => invoke('workspace:detect', { path }),
  getProfile: () => invoke('profile:get'),
  saveProfile: (profile) => invoke('profile:save', profile),
  listDocs: (dir) => invoke('docs:list', { dir }),
  readDoc: (path) => invoke('docs:read', { path }),
  openDoc: (path) => invoke('docs:openInEditor', { path }),
  revealDoc: (path) => invoke('docs:reveal', { path }),
  copyDoc: (path) => invoke('docs:copy', { path }),
  changedSince: (since) => invoke('docs:changedSince', { since }),
  setSocialTagline: (network, text) => invoke('social:setTagline', { network, text }),
  openSource: (url, path) => invoke('shell:openSource', { url, path }),
  allowResearchLinks: () => invoke('settings:allowResearchLinks'),
  rerunResearch: (target) => invoke('research:rerun', target),
  researchCatalog: () => invoke('research:catalog'),
  listInputs: () => invoke('inputs:list'),
  addInputs: (category, paths) => invoke('inputs:add', { category, paths }),
  browseInputs: (category) => invoke('inputs:browse', { category }),
  removeInput: (category, name) => invoke('inputs:remove', { category, name }),
  estimateResearch: () => invoke('research:estimate'),
  startResearch: (options) => invoke('research:start', options ?? {}),
  getResearchRun: () => invoke('research:getRun'),
  pauseResearch: () => invoke('research:pause'),
  resumeResearch: (options) => invoke('research:resume', options ?? {}),
  cancelResearch: () => invoke('research:cancel'),
  retryResearchTask: (taskId) => invoke('research:retryTask', { taskId }),
  setResearchBudget: (budgetCapUsd) => invoke('research:setBudget', { budgetCapUsd }),
  devRunStep: (req) => invoke('dev:runStep', req),
  checkUrl: (url) => invoke('net:checkUrl', { url }),
  getFilePath: (file) => webUtils.getPathForFile(file),
  startChat: (args) => invoke('chat:start', args),
  cancelChat: (streamId) => invoke('chat:cancel', { streamId }),
  listChats: () => invoke('chats:list'),
  getChat: (id) => invoke('chats:get', { id }),
  saveChat: (chat) => invoke('chats:save', chat),
  renameChat: (id, title) => invoke('chats:rename', { id, title }),
  deleteChat: (id) => invoke('chats:delete', { id }),
  checkWiki: () => invoke('wiki:check'),
  getHub: () => invoke('hub:get'),
  useHubFolder: (name) => invoke('workspace:useHub', { name }),
  registerInHub: () => invoke('hub:register'),
  listArticles: () => invoke('wiki:articles'),
  getArticle: (path) => invoke('wiki:article', { path }),
  listSources: () => invoke('wiki:sources'),
  listOutputs: (kind) => invoke('wiki:outputs', { kind }),
  reassemble: () => invoke('wiki:reassemble'),
  lastCheck: () => invoke('wiki:lastCheck'),
  exportFile: (includePrivate) => invoke('wiki:exportFile', { includePrivate }),
  exportZip: () => invoke('wiki:exportZip'),
  previewDecision: (d) => invoke('decision:preview', d),
  recordDecision: (d) => invoke('decision:record', d),
  openObsidian: () => invoke('shell:openObsidian'),
  fixWiki: () => invoke('wiki:fix'),
  disconnect: () => invoke('secrets:disconnect'),
  openExternal: (url) => invoke('shell:openExternal', { url }),
  onChatEvent: (cb) => {
    const listener = (_e: unknown, raw: unknown): void => {
      const parsed = ChatEnvelopeSchema.safeParse(raw)
      if (parsed.success) cb(parsed.data)
    }
    ipcRenderer.on(EVENT_CHAT, listener)
    return () => ipcRenderer.removeListener(EVENT_CHAT, listener)
  },
  onResearchEvent: (cb) => {
    const listener = (_e: unknown, raw: unknown): void => {
      const parsed = RunViewSchema.safeParse(raw)
      if (parsed.success) cb(parsed.data)
    }
    ipcRenderer.on(EVENT_RESEARCH, listener)
    return () => ipcRenderer.removeListener(EVENT_RESEARCH, listener)
  },
  onWorkspaceChanged: (cb) => {
    const listener = (_e: unknown, raw: unknown): void => {
      const parsed = WorkspaceChangedSchema.safeParse(raw)
      if (parsed.success) cb(parsed.data)
    }
    ipcRenderer.on(EVENT_WORKSPACE_CHANGED, listener)
    return () => ipcRenderer.removeListener(EVENT_WORKSPACE_CHANGED, listener)
  },
  onOpenSettings: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on(EVENT_OPEN_SETTINGS, listener)
    return () => ipcRenderer.removeListener(EVENT_OPEN_SETTINGS, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
