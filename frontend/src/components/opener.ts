let lastTapped: Element | null = null
addEventListener(
  'click',
  (e) => (lastTapped = (e.target as Element | null)?.closest?.('button,a[href],[role="button"]') ?? null),
  true,
)

/**
 * The element to give focus back to when a dialog closes. WebKit does not focus a button on tap, so
 * `activeElement` is BODY then; use the tapped control instead.
 */
export function currentOpener(): HTMLElement | null {
  const active = document.activeElement
  if (active && active !== document.body) return active as HTMLElement
  return lastTapped instanceof HTMLElement && lastTapped.isConnected ? lastTapped : null
}

let keyboard = false
const MODIFIERS = ['Shift', 'Control', 'Alt', 'Meta']
addEventListener('keydown', (e) => (keyboard ||= !MODIFIERS.includes(e.key)), true)
addEventListener('pointerdown', () => (keyboard = false), true)
// a tap that never produced pointer events (assistive click, tests) still counts as pointer input
addEventListener('click', (e) => e.detail > 0 && (keyboard = false), true)

/** Keyboard was the last input: Escape, Enter or Space closed the dialog, so focus must stay visible. */
export const usingKeyboard = () => keyboard

/**
 * Programmatic focus (dialog open and close) that shows no ring after a mouse or touch interaction: some engines
 * treat script focus as `:focus-visible` whatever the last input was. `data-pointer-focus` hides the ring (index.css)
 * until the element blurs. After keyboard input the ring stays.
 */
export function focusQuietly(el: HTMLElement | null | undefined, options?: FocusOptions) {
  if (!el) return
  if (!keyboard) {
    el.setAttribute('data-pointer-focus', '')
    el.addEventListener('blur', () => el.removeAttribute('data-pointer-focus'), { once: true })
  }
  el.focus(options)
}
