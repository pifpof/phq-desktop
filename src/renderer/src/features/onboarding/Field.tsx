import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'

interface Props {
  id: string
  label: string
  required?: boolean
  helper?: string
  error?: string | null
  children: ReactNode
}

export function Field({ id, label, required, helper, error, children }: Props) {
  return (
    <div>
      <Label htmlFor={id}>
        {label}
        {required ? '' : <span className="text-muted-foreground font-normal"> (optional)</span>}
      </Label>
      <div className="mt-2">{children}</div>
      {error ? (
        <p className="text-destructive mt-2 text-[13px]" role="alert">
          {error}
        </p>
      ) : helper ? (
        <p className="text-muted-foreground mt-2 text-[13px]">{helper}</p>
      ) : null}
    </div>
  )
}
