import { useEffect, useRef } from 'react'

/** Transient error message above the tab bar and safe area; tap to dismiss, auto-hides. */
export function Toast({
  message,
  dismissLabel,
  onDismiss,
  durationMs = 5000,
  action,
}: {
  message: string
  dismissLabel: string
  onDismiss: () => void
  durationMs?: number
  /** Optional text button next to the message (Retry, Open Settings). */
  action?: { label: string; onClick: () => void }
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
        role="alert"
        className="bg-danger-bg text-danger text-body pointer-events-auto flex min-h-11 max-w-md items-center gap-3 rounded-md py-1 pr-1 pl-4 font-medium"
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
