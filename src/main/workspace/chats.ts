import { mkdir, readdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { ChatIdSchema, ChatRecordSchema, type ChatRecord, type ChatSummary } from '@shared/chat'

const dir = (root: string): string => join(root, '.positioninghq', 'chats')
/** Only well-formed IDs reach the file system, so a chat ID can never be a path. */
const file = (root: string, id: string): string => join(dir(root), `${ChatIdSchema.parse(id)}.json`)

export async function listChats(root: string): Promise<ChatSummary[]> {
  let names: string[]
  try {
    names = (await readdir(dir(root))).filter((n) => n.endsWith('.json'))
  } catch {
    return []
  }
  const chats = await Promise.all(names.map((n) => getChat(root, n.replace(/\.json$/, ''))))
  return chats
    .filter((c): c is ChatRecord => c !== null)
    .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getChat(root: string, id: string): Promise<ChatRecord | null> {
  if (!ChatIdSchema.safeParse(id).success) return null
  try {
    const parsed = ChatRecordSchema.safeParse(JSON.parse(await readFile(file(root, id), 'utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function saveChat(root: string, chat: ChatRecord): Promise<void> {
  await mkdir(dir(root), { recursive: true })
  const target = file(root, chat.id)
  const tmp = `${target}.tmp`
  await writeFile(tmp, JSON.stringify(chat, null, 2))
  await rename(tmp, target)
}

export async function renameChat(root: string, id: string, title: string): Promise<boolean> {
  const chat = await getChat(root, id)
  if (!chat) return false
  await saveChat(root, { ...chat, title: title.trim().slice(0, 200) || chat.title })
  return true
}

export async function deleteChat(root: string, id: string): Promise<void> {
  await rm(file(root, id), { force: true })
}
