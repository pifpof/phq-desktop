import { create } from 'zustand'

export interface Toast {
  id: string
  text: string
  action?: { label: string; run(): void }
  /** Stays until dismissed (REQUIREMENTS-v4.4 3.2). Others go after a few seconds. */
  sticky?: boolean
}

interface ToastStore {
  toasts: Toast[]
  /** Shows a toast. A toast with the same id replaces the old one. */
  show(t: Toast): void
  dismiss(id: string): void
}

const TIMEOUT_MS = 8000

export const useToasts = create<ToastStore>((set, get) => ({
  toasts: [],
  show(t) {
    set({ toasts: [...get().toasts.filter((x) => x.id !== t.id), t] })
    if (!t.sticky) setTimeout(() => get().dismiss(t.id), TIMEOUT_MS)
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  }
}))
