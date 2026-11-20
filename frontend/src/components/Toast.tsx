import { useEffect, useRef } from 'react'

/** Transient message (error by default, `info` for a confirmation) above the tab bar and safe area; tap to dismiss, auto-hides. */
export function Toast({
  message,
  dismissLabel,
  onDismiss,
  durationMs = 5000,
  action,
  tone = 'error',
}: {
  message: string
  dismissLabel: string
  onDismiss: () => void
  durationMs?: number
  /** Optional text button next to the message (Retry, Open Settings). */
  action?: { label: string; onClick: () => void }
  tone?: 'error' | 'info'
}) {
  const dismiss = useRef(onDismiss)
  useEffect(() => {
    dismiss.current = onDismiss
  })
  useEffect(() => {
    const id = setTimeout(() => dismiss.current(), durationMs)
    return () => clearTimeout(id)
  }, [message, durationMs])
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-50 md:bottom-6 md:left-[var(--sidebar-w)] flex justify-center px-4">
      <div
        role={tone === 'error' ? 'alert' : 'status'}
        className={`${tone === 'error' ? 'bg-danger-bg text-danger' : 'bg-surface-2 text-ink'} text-body pointer-events-auto flex min-h-11 max-w-md items-center gap-3 rounded-md py-1 pr-1 pl-4 font-medium`}
      >
        <span className="flex-1">{message}</span>
        {action && (
          <button type="button" onClick={action.onClick} className="min-h-11 px-2 font-semibold underline">
            {action.label}
          </button>
        )}
        <button
          type="button"
          aria-label={dismissLabel}
          onClick={onDismiss}
          className="min-h-11 min-w-11 text-xl leading-none"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </div>
  )
}
