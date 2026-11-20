import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { InstallSection } from '../features/settings/InstallSection'
import { captureInstallEvents, detectInstallMode } from './install'

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36'
const DESKTOP_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0'

const env = (
  userAgent: string,
  o: { platform?: string; touch?: number; standalone?: boolean; display?: boolean; prompt?: boolean } = {},
) => ({
  matchMedia: () => ({ matches: o.display ?? false }),
  navigator: { userAgent, platform: o.platform ?? '', maxTouchPoints: o.touch ?? 0, standalone: o.standalone },
  hasPromptEvent: o.prompt ?? false,
})

describe('detectInstallMode', () => {
  it.each([
    ['iPhone Safari', env(IPHONE, { platform: 'iPhone', touch: 5 }), 'ios-steps'],
    [
      'iPad in desktop mode (reports as Mac with touch)',
      env(IPAD_DESKTOP, { platform: 'MacIntel', touch: 5 }),
      'ios-steps',
    ],
    ['a real Mac (no touch points)', env(IPAD_DESKTOP, { platform: 'MacIntel', touch: 0 }), 'none'],
    ['Android Chrome without the event', env(ANDROID, { platform: 'Linux armv81', touch: 5 }), 'none'],
    ['Android Chrome with the event', env(ANDROID, { prompt: true }), 'prompt'],
    ['desktop Chrome with the event', env(DESKTOP_CHROME, { prompt: true }), 'prompt'],
    ['desktop Chrome without it', env(DESKTOP_CHROME), 'none'],
    ['Firefox', env(FIREFOX), 'none'],
    ['standalone by display-mode', env(DESKTOP_CHROME, { display: true, prompt: true }), 'installed'],
    [
      'standalone by navigator.standalone',
      env(IPHONE, { platform: 'iPhone', touch: 5, standalone: true }),
      'installed',
    ],
    ['navigator.standalone false', env(IPHONE, { standalone: false }), 'ios-steps'],
  ])('%s', (_name, e, mode) => {
    expect(detectInstallMode(e)).toBe(mode)
  })
})

function installEvent() {
  const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void> }
  e.prompt = vi.fn(() => Promise.resolve())
  return e
}

function setNavigator(props: Record<string, unknown>) {
  for (const [k, v] of Object.entries(props)) Object.defineProperty(navigator, k, { value: v, configurable: true })
}

function setDisplayStandalone(on: boolean) {
  window.matchMedia = ((q: string) => ({ matches: on && q.includes('standalone') })) as typeof window.matchMedia
}

beforeAll(() => captureInstallEvents())

describe('Settings App row', () => {
  const mount = () => render(<InstallSection locale="en" />)

  it('is absent where installing is not possible', () => {
    setNavigator({ userAgent: FIREFOX, platform: 'Linux x86_64', maxTouchPoints: 0 })
    setDisplayStandalone(false)
    mount()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is absent when installed, even on iOS', () => {
    setNavigator({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 })
    setDisplayStandalone(true)
    mount()
    expect(screen.queryByRole('button')).toBeNull()
    setDisplayStandalone(false)
  })

  it('on iOS opens the three steps, Done closes and focus returns to the row', () => {
    setNavigator({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 })
    setDisplayStandalone(false)
    mount()
    const row = screen.getByRole('button', { name: /Add to Home Screen/ })
    row.focus()
    fireEvent.click(row)
    const dialog = screen.getByRole('dialog', { name: 'Add RWX to your Home Screen' })
    expect(dialog.querySelectorAll('ol > li')).toHaveLength(3)
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Done' })[1]!)
    expect(screen.queryByRole('dialog')).toBeNull()
    return vi.waitFor(() => expect(document.activeElement).toBe(row))
  })

  it('shows the prompt row for an event fired before mount, calls prompt() once and hides', async () => {
    setNavigator({ userAgent: ANDROID, platform: 'Linux armv81', maxTouchPoints: 5 })
    const e = installEvent()
    act(() => void window.dispatchEvent(e))
    expect(e.defaultPrevented).toBe(true)
    mount()
    fireEvent.click(screen.getByRole('button', { name: /Install app/ }))
    expect(e.prompt).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(screen.queryByRole('button')).toBeNull())
  })

  it('appears when the event fires after mount and disappears on appinstalled', () => {
    setNavigator({ userAgent: ANDROID, platform: 'Linux armv81', maxTouchPoints: 5 })
    mount()
    expect(screen.queryByRole('button')).toBeNull()
    act(() => void window.dispatchEvent(installEvent()))
    expect(screen.getByRole('button', { name: /Install app/ })).toBeTruthy()
    act(() => void window.dispatchEvent(new Event('appinstalled')))
    expect(screen.queryByRole('button')).toBeNull()
  })
})
