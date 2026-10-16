import { useState } from 'react'
import { normalizeWebsite } from '@shared/url'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TagInput } from '@/components/TagInput'
import { api, unwrap } from '@/lib/api'
import { useApp } from '@/store/app'
import { Field } from './Field'
import { stepNumber } from './steps'
import { WizardShell } from './WizardShell'

export function CompanyStep() {
  const profile = useApp((s) => s.profile)
  const c = profile?.company
  const [name, setName] = useState(c?.name ?? '')
  const [website, setWebsite] = useState(c?.website ?? '')
  const [productName, setProductName] = useState(c?.productName ?? '')
  const [description, setDescription] = useState(c?.description ?? '')
  const [competitors, setCompetitors] = useState(c?.competitors ?? [])
  const [checking, setChecking] = useState(false)
  const [websiteError, setWebsiteError] = useState<string | null>(null)
  const [unreachable, setUnreachable] = useState(false)

  const ready = name.trim() !== '' && website.trim() !== ''

  const save = async (url: string): Promise<void> => {
    await useApp.getState().advance(
      (p) => ({
        ...p,
        company: {
          name: name.trim(),
          website: url,
          productName: productName.trim(),
          description: description.trim(),
          competitors
        }
      }),
      'about'
    )
  }

  const submit = async (anyway = false): Promise<void> => {
    if (!ready || checking) return
    const url = normalizeWebsite(website)
    if (!url) {
      setWebsiteError('That doesn’t look like a website address. Try something like acme.com.')
      return
    }
    setWebsiteError(null)
    setWebsite(url)
    if (!anyway) {
      setChecking(true)
      try {
        const res = await unwrap(api.checkUrl(url))
        if (!res.reachable) {
          setUnreachable(true)
          return
        }
      } catch {
        setUnreachable(true)
        return
      } finally {
        setChecking(false)
      }
    }
    await save(url)
  }

  return (
    <WizardShell step={stepNumber('company')} onBack={() => useApp.getState().go('workspace')}>
      <h2>Tell us about your company</h2>
      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Field id="company-name" label="Company name" required>
          <Input
            id="company-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field
          id="company-website"
          label="Website"
          required
          error={unreachable ? "We couldn't reach that website. Check the address." : websiteError}
        >
          <Input
            id="company-website"
            inputMode="url"
            placeholder="acme.com"
            value={website}
            onChange={(e) => {
              setWebsite(e.target.value)
              setUnreachable(false)
              setWebsiteError(null)
            }}
          />
        </Field>
        <Field id="product-name" label="Product name" helper="Defaults to the company name.">
          <Input
            id="product-name"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
          />
        </Field>
        <Field
          id="description"
          label="What you sell, in one line"
          helper="Your best guess. We'll check it against your website."
        >
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field
          id="competitors"
          label="Main competitors"
          helper="Leave blank and we'll find them. Up to 5."
        >
          <TagInput
            id="competitors"
            value={competitors}
            onChange={setCompetitors}
            max={5}
            placeholder="Type a name and press Enter"
          />
        </Field>

        {unreachable ? (
          <div className="flex gap-3">
            <Button type="submit" className="flex-1" disabled={checking}>
              Check again
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => void submit(true)}
            >
              Continue anyway
            </Button>
          </div>
        ) : (
          <Button type="submit" className="w-full" disabled={!ready || checking}>
            {checking ? 'Checking your website...' : 'Continue'}
          </Button>
        )}
      </form>
    </WizardShell>
  )
}
