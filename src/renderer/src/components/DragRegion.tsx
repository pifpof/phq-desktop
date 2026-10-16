import { useApp } from '@/store/app'

/** 28px window drag strip on macOS, where the title bar is hidden. */
export function DragRegion() {
  const platform = useApp((s) => s.state?.platform)
  if (platform !== 'mac') return null
  return <div className="drag absolute inset-x-0 top-0 z-40 h-7" aria-hidden />
}
