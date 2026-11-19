import { currentOpener, focusQuietly, usingKeyboard } from './opener'
import { useEffect, useId, useRef, type ReactNode } from 'react'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Below `md`: content-height bottom sheet (design system section 2): grabber, 24px top corners, scrim tap and
 * a text Close button (swipe-down is not reliable in a PWA). Moves focus in, keeps Tab inside,
 * closes on Escape and returns focus to the opener (or, if that left the DOM and the last input was the keyboard, to the first `[data-focus-fallback]` element).
 * The sheet follows the visual viewport (`--vvh`, `--vvt`), so with the iOS keyboard up it sits above the keyboard;
 * without `visualViewport` it is 88dvh high. From `md` up the same markup is a centered modal dialog (32rem wide, at most
 * 85dvh, all corners rounded, fade and scale in, no grabber); the viewport variables are ignored there.
 */
export function Sheet({
  title,
  closeLabel,
  onClose,
  leading,
  fullHeight = false,
  inert = false,
  footer,
  children,
}: {
  title: string
  closeLabel: string
  onClose: () => void
  /** Optional left header control (e.g. Reset); replaces the empty spacer. */
  leading?: ReactNode
  /** Add sheet: fixed full height instead of content height. */
  fullHeight?: boolean
  /** Another sheet is open above this one: nothing here can be focused or announced. */
  inert?: boolean
  /** Pinned below the scrolling content (the preview's Add button). */
  footer?: ReactNode
  children: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // read during the first render, before the effect moves focus into the sheet (and StrictMode re-runs the effect)
  const opener = useRef(currentOpener())

  useEffect(() => {
    const back = opener.current
    // a field marked data-autofocus wins over the header's Close button (add sheet opens with the keyboard up)
    const target =
      panel.current?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel.current?.querySelector<HTMLElement>('[data-autofocus-default]')
    focusQuietly(target)
    return () => {
      // The opener may be gone (its row was removed by an optimistic delete, possibly in the same commit that
      // closes the sheet): decide after the commit, and fall back to the screen's marked element.
      queueMicrotask(() => {
        if (document.activeElement && document.activeElement !== document.body) return // something else (e.g. a new sheet) took focus
        // the fallback (the search field) is for keyboard users: after a tap, focusing it would show its ring
        const returnTo = back?.isConnected
          ? back
          : usingKeyboard()
            ? document.querySelector<HTMLElement>('[data-focus-fallback]')
            : null
        focusQuietly(returnTo)
      })
    }
  }, [])

  useEffect(() => {
    const vv = window.visualViewport
    const el = root.current
    if (!vv || !el) return
    const sync = () => {
      el.style.setProperty('--vvh', `${vv.height}px`)
      el.style.setProperty('--vvt', `${vv.offsetTop}px`)
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
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
      ref={root}
      inert={inert}
      aria-hidden={inert || undefined}
      className="fixed inset-x-0 top-[var(--vvt,0px)] z-40 flex h-[var(--vvh,100dvh)] flex-col justify-end md:inset-y-0 md:h-auto md:items-center md:justify-center md:px-4"
      onKeyDown={onKeyDown}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-[var(--scrim)]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-bg text-ink shadow-sheet rounded-t-sheet relative flex max-h-[calc(var(--vvh,100dvh)*0.88)] flex-col md:motion-safe:animate-[dialog-in_160ms_ease-out] md:max-h-[85dvh] md:w-full md:max-w-lg md:rounded-sheet md:border-separator md:border-[0.5px] md:shadow-dialog ${fullHeight ? 'h-[calc(var(--vvh,100dvh)*0.88)] md:h-[85dvh]' : ''}`}
      >
        <div aria-hidden="true" className="bg-separator mx-auto mt-2 h-1 w-9 shrink-0 rounded-full md:hidden" />
        <header className="flex shrink-0 items-center px-4 pt-1 md:pt-3">
          {leading ?? <span className="min-w-16" />}
          <h2 id={titleId} className="text-sheet flex-1 truncate text-center font-semibold">
            {title}
          </h2>
          <button
            type="button"
            data-autofocus-default
            onClick={onClose}
            className="text-accent text-input min-h-11 min-w-16 text-right font-semibold"
          >
            {closeLabel}
          </button>
        </header>
        <div
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2 ${footer ? 'pb-4' : 'pb-[calc(env(safe-area-inset-bottom)+1rem)]'}`}
        >
          {children}
        </div>
        {footer && <div className="shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">{footer}</div>}
      </div>
    </div>
  )
}
