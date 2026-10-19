import { create } from 'zustand'
import type { HelpItem, HelpPlan } from '@shared/help'
import { api, unwrap } from '@/lib/api'

/** The Help plan (REQUIREMENTS-v4 9) and its sheet. */
interface HelpStore {
  plan: HelpPlan
  open: boolean
  /** Gaps ticked for "Ask for help with these". */
  selected: Set<string>
  load(): Promise<void>
  add(item: Omit<HelpItem, 'addedAt'>, opts?: { openSheet?: boolean }): Promise<void>
  remove(id: string): Promise<void>
  toggle(id: string): void
  setOpen(open: boolean): void
}

export const useHelp = create<HelpStore>((set, get) => ({
  plan: { items: [], helpRequested: [] },
  open: false,
  selected: new Set(),
  async load() {
    const plan = await unwrap(api.helpPlan()).catch(() => null)
    if (plan) set({ plan, selected: new Set(plan.items.map((i) => i.id)) })
  },
  async add(item, opts = {}) {
    const plan = await unwrap(api.addHelp(item)).catch(() => null)
    if (!plan) return
    // A gap added from its box is ticked; "Get expert help" opens the sheet on it.
    set({
      plan,
      selected: new Set([...get().selected, item.id]),
      ...(opts.openSheet ? { open: true } : {})
    })
  },
  async remove(id) {
    const plan = await unwrap(api.removeHelp(id)).catch(() => null)
    if (!plan) return
    const selected = new Set(get().selected)
    selected.delete(id)
    set({ plan, selected })
  },
  toggle(id) {
    const selected = new Set(get().selected)
    if (selected.has(id)) selected.delete(id)
    else selected.add(id)
    set({ selected })
  },
  setOpen: (open) => set({ open })
}))
