import { useState } from 'react'
import { Check } from 'lucide-react'
import { COMPANY_SIZES, GOALS, ROLES, type Profile } from '@shared/profile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { TagInput } from '@/components/TagInput'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { Field } from '@/features/onboarding/Field'

/** The onboarding answers, editable. Saving marks the playbook out of date (it compares file times). */
export function ProfilePane() {
  const saved = useApp((s) => s.profile)
  const [p, setP] = useState<Profile | null>(saved)
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  if (!p) return null
  const set = (edit: (q: Profile) => void): void => {
    const next = structuredClone(p)
    edit(next)
    setP(next)
    setState('idle')
  }
  const save = async (): Promise<void> => {
    setState('saving')
    await useApp.getState().saveProfile(() => p)
    setState('saved')
  }
  const valid =
    p.company.name.trim() !== '' && p.company.website.trim() !== '' && p.goals.length > 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[560px] px-6 py-8">
        <h2 className="text-[22px]">Your company</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Every research task treats these answers as ground truth. Changes mark your playbook as
          out of date.
        </p>
        <div className="mt-6 space-y-5">
          <Field id="p-name" label="Company name" required>
            <Input
              id="p-name"
              value={p.company.name}
              onChange={(e) => set((q) => void (q.company.name = e.target.value))}
            />
          </Field>
          <Field id="p-site" label="Website" required>
            <Input
              id="p-site"
              value={p.company.website}
              onChange={(e) => set((q) => void (q.company.website = e.target.value))}
            />
          </Field>
          <Field id="p-product" label="Product name">
            <Input
              id="p-product"
              value={p.company.productName}
              onChange={(e) => set((q) => void (q.company.productName = e.target.value))}
            />
          </Field>
          <Field id="p-desc" label="What you sell, in one line">
            <Input
              id="p-desc"
              value={p.company.description}
              onChange={(e) => set((q) => void (q.company.description = e.target.value))}
            />
          </Field>
          <Field id="p-comp" label="Main competitors" helper="Up to 5.">
            <TagInput
              id="p-comp"
              value={p.company.competitors}
              max={5}
              onChange={(v) => set((q) => void (q.company.competitors = v))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field id="p-role" label="Your role">
              <Select value={p.user.role} onValueChange={(v) => set((q) => void (q.user.role = v))}>
                <SelectTrigger id="p-role" placeholder="Choose" />
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="p-size" label="Company size">
              <Select
                value={p.user.companySize}
                onValueChange={(v) => set((q) => void (q.user.companySize = v))}
              >
                <SelectTrigger id="p-size" placeholder="Choose" />
                <SelectContent>
                  {COMPANY_SIZES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div>
            <p className="text-sm font-semibold">Goals</p>
            <div role="group" aria-label="Goals" className="mt-2 flex flex-wrap gap-2">
              {GOALS.map((g) => {
                const on = p.goals.includes(g.id as Profile['goals'][number])
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() =>
                      set((q) => {
                        const id = g.id as Profile['goals'][number]
                        q.goals = on ? q.goals.filter((x) => x !== id) : [...q.goals, id]
                      })
                    }
                    className={cn(
                      'focus-visible:ring-ring/50 rounded-full border px-3 py-1.5 text-[13px] font-semibold outline-none focus-visible:ring-[3px]',
                      on ? 'border-primary-light bg-accent text-primary' : 'hover:bg-muted bg-white'
                    )}
                  >
                    {g.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <div className="mt-8 flex items-center gap-3">
          <Button disabled={!valid || state === 'saving'} onClick={() => void save()}>
            Save changes
          </Button>
          {state === 'saved' && (
            <span
              className="text-primary flex items-center gap-1 text-sm font-semibold"
              role="status"
            >
              <Check className="size-4" strokeWidth={2} />
              Saved
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
