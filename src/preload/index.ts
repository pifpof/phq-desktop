import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  ChatEnvelopeSchema,
  EVENT_CHAT,
  EVENT_OPEN_SETTINGS,
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
  listInputs: () => invoke('inputs:list'),
  addInputs: (category, paths) => invoke('inputs:add', { category, paths }),
  browseInputs: (category) => invoke('inputs:browse', { category }),
  removeInput: (category, name) => invoke('inputs:remove', { category, name }),
  checkUrl: (url) => invoke('net:checkUrl', { url }),
  getFilePath: (file) => webUtils.getPathForFile(file),
  startChat: (args) => invoke('chat:start', args),
  cancelChat: (streamId) => invoke('chat:cancel', { streamId }),
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
