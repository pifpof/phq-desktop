import type { ReactNode } from 'react'

interface Props {
  n: number
  title: string
  children?: ReactNode
}

export function NumberedStep({ n, title, children }: Props) {
  return (
    <li className="flex gap-4">
      <span className="numeral w-6 shrink-0 text-center text-[26px] leading-none">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="text-muted-foreground mt-0.5 text-sm">{children}</div>}
      </div>
    </li>
  )
}
