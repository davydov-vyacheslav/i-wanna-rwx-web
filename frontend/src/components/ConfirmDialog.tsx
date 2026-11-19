import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { currentOpener, focusQuietly } from './opener'
import { Spinner } from './Spinner'

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href]'

/**
 * Centered confirmation for a destructive action (`role="alertdialog"`); `role="dialog"`, `tone="accent"` and `children` make it a small form dialog (the data source key). Cancel has focus on open, Escape and a scrim tap
 * cancel (all three ignored while `pending`: a request already sent cannot be dismissed), Tab stays inside, and focus returns to the opener on close. The confirm button is danger-styled and fires once.
 * Static on phones; on wide screens it fades in like the Sheet dialog. Rendered above sheets (z-60).
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  pending,
  error,
  children,
  role = 'alertdialog',
  tone = 'danger',
  initialFocus = 'cancel',
  confirmDisabled,
}: {
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  /** Optional: confirm and cancel are disabled (Escape and scrim ignored) while a request is in flight; a retry is possible once it settles. */
  pending?: boolean
  /** Optional inline error (announced with `role="alert"`), shown above the buttons. */
  error?: string
  /** Content between the body and the buttons (form fields). */
  children?: ReactNode
  role?: 'alertdialog' | 'dialog'
  tone?: 'danger' | 'accent'
  /** `content`: the caller focuses a field itself (`autoFocus`) instead of Cancel. */
  initialFocus?: 'cancel' | 'content'
  confirmDisabled?: boolean
}) {
  const panel = useRef<HTMLDivElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const fired = useRef(false)
  const titleId = useId()
  const bodyId = useId()

  // A request already sent cannot be dismissed: disabling the buttons drops focus to BODY, so move it to the panel
  // (Escape and Tab trapping keep working). When the request settles (error shown) focus goes back to Cancel.
  const wasPending = useRef(false)
  useLayoutEffect(() => {
    const el = panel.current
    if (!el) return
    const move = () => {
      const active = document.activeElement
      if (pending) {
        const lost = active instanceof HTMLButtonElement && active.disabled
        if (!el.contains(active) || active === document.body || lost) el.focus()
      } else if (wasPending.current && (!el.contains(active) || active === el)) {
        cancelButton.current?.focus()
      }
    }
    move()
    // some browsers blur a button only after it becomes disabled, so check again after the commit
    if (pending) queueMicrotask(move)
    wasPending.current = !!pending
  }, [pending])

  // read during the first render: a field with `autoFocus` takes focus before any effect runs
  const opener = useRef(currentOpener())
  useEffect(() => {
    const back = opener.current
    if (initialFocus === 'cancel') focusQuietly(cancelButton.current)
    return () => {
      queueMicrotask(() => {
        if (document.activeElement && document.activeElement !== document.body) return
        // preventScroll: the opener may be the Delete button of a swiped card, which the list snaps back to rest
        if (back?.isConnected) focusQuietly(back, { preventScroll: true })
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, on open
  }, [])

  function confirm() {
    // Controlled (`pending` given): the parent's pending state is the guard, so a retry after an error works.
    if (pending) return
    if (pending === undefined) {
      if (fired.current) return
      fired.current = true
    }
    onConfirm()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (!pending) onCancel()
      return
    }
    if (e.key !== 'Tab' || !panel.current) return
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    const first = items[0]
    const last = items[items.length - 1]
    if (!first || !last) return
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      onKeyDown={onKeyDown}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-[var(--scrim)]" onClick={pending ? undefined : onCancel} />
      <div
        ref={panel}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className="bg-surface border-separator outline-none text-ink shadow-dialog md:motion-safe:animate-[dialog-in_160ms_ease-out] border-[0.5px] rounded-card relative max-h-[88dvh] w-full max-w-sm overflow-y-auto p-5"
      >
        <h2 id={titleId} className="text-sheet font-semibold">
          {title}
        </h2>
        <p id={bodyId} className="text-body text-ink-2 mt-2 [overflow-wrap:anywhere]">
          {body}
        </p>
        {children}
        {error && (
          <p
            role="alert"
            className="text-danger bg-danger-bg text-body rounded-md mt-3 px-3 py-2 [overflow-wrap:anywhere]"
          >
            {error}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <button
            ref={cancelButton}
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="bg-surface-2 text-ink text-input min-h-11 flex-1 rounded-md px-4 font-semibold disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={pending || confirmDisabled}
            aria-busy={pending || undefined}
            className={`${tone === 'danger' ? 'bg-danger' : 'bg-accent'} text-on-accent text-input min-h-11 flex-1 rounded-md px-4 font-semibold disabled:opacity-60`}
          >
            <span className="inline-flex items-center justify-center gap-2">
              {pending && <Spinner />}
              {confirmLabel}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
