import { useCallback, useEffect, useState } from 'react'
import { INPUT_CATEGORIES, type InputCategory, type InputFile } from '@shared/workspace'
import { api, unwrap } from '@/lib/api'

export type Files = Record<InputCategory, InputFile[]>
const emptyFiles = (): Files =>
  Object.fromEntries(INPUT_CATEGORIES.map((c) => [c, []])) as unknown as Files

/** The person's files in inputs/: list, add (drop or browse) and remove the copy. Refreshes when the folder changes. */
export function useInputs() {
  const [files, setFiles] = useState<Files>(emptyFiles)
  const [messages, setMessages] = useState<Partial<Record<InputCategory, string>>>({})

  const reload = useCallback(
    () =>
      unwrap(api.listInputs())
        .then((f) => setFiles({ ...emptyFiles(), ...f }))
        .catch(() => undefined),
    []
  )
  useEffect(() => {
    void reload()
    return api.onWorkspaceChanged(({ paths }) => {
      if (paths.some((p) => p.startsWith('inbox/') || p.startsWith('raw/'))) void reload()
    })
  }, [reload])

  const report = (category: InputCategory, refused: { name: string; reason: string }[]): void =>
    setMessages((m) => ({
      ...m,
      [category]: refused.length
        ? refused.map((r) => `${r.name}: ${r.reason}`).join(' ')
        : undefined
    }))

  return {
    files,
    messages,
    total: Object.values(files).reduce((n, f) => n + f.length, 0),
    async add(category: InputCategory, paths: string[]) {
      const r = await unwrap(api.addInputs(category, paths)).catch(() => null)
      if (r) report(category, r.refused)
      await reload()
    },
    async browse(category: InputCategory) {
      const r = await unwrap(api.browseInputs(category)).catch(() => null)
      if (r) report(category, r.refused)
      await reload()
    },
    async remove(category: InputCategory, name: string) {
      await unwrap(api.removeInput(category, name)).catch(() => undefined)
      await reload()
    }
  }
}
