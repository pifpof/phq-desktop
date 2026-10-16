import { useState } from 'react'
import { COMPANY_SIZES, ROLES } from '@shared/profile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { useApp } from '@/store/app'
import { Field } from './Field'
import { stepNumber } from './steps'
import { WizardShell } from './WizardShell'

export function AboutYouStep() {
  const u = useApp((s) => s.profile?.user)
  const [name, setName] = useState(u?.name ?? '')
  const [role, setRole] = useState(u?.role ?? '')
  const [roleOther, setRoleOther] = useState(u?.roleOther ?? '')
  const [size, setSize] = useState(u?.companySize ?? '')

  const ready =
    name.trim() !== '' &&
    role !== '' &&
    size !== '' &&
    (role !== 'Other' || roleOther.trim() !== '')

  const submit = (): void => {
    if (!ready) return
    void useApp.getState().advance(
      (p) => ({
        ...p,
        user: {
          name: name.trim(),
          role,
          roleOther: role === 'Other' ? roleOther.trim() : '',
          companySize: size
        }
      }),
      'goals'
    )
  }

  return (
    <WizardShell step={stepNumber('about')} onBack={() => useApp.getState().go('company')}>
      <h2>About you</h2>
      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field id="your-name" label="Your name" required>
          <Input id="your-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field id="your-role" label="Your role" required>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger id="your-role" placeholder="Choose your role" />
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {role === 'Other' && (
          <Field id="role-other" label="Describe your role" required>
            <Input
              id="role-other"
              value={roleOther}
              onChange={(e) => setRoleOther(e.target.value)}
            />
          </Field>
        )}
        <Field id="company-size" label="Company size" required>
          <Select value={size} onValueChange={setSize}>
            <SelectTrigger id="company-size" placeholder="Choose a size" />
            <SelectContent>
              {COMPANY_SIZES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Button type="submit" className="w-full" disabled={!ready}>
          Continue
        </Button>
      </form>
    </WizardShell>
  )
}
