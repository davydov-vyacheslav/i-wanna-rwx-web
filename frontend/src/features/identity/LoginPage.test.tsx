import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { captureInstallEvents } from '../../pwa/install'
import { t, type Locale } from '../../i18n'
import { LoginPage } from './LoginPage'

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36'
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0'

function setNavigator(props: Record<string, unknown>) {
  for (const [k, v] of Object.entries(props)) Object.defineProperty(navigator, k, { value: v, configurable: true })
}
const setStandalone = (on: boolean) => {
  window.matchMedia = ((q: string) => ({ matches: on && q.includes('standalone') })) as typeof window.matchMedia
}
const setOnline = (on: boolean) => setNavigator({ onLine: on })

beforeAll(() => captureInstallEvents())
afterEach(() => {
  setOnline(true)
  setStandalone(false)
  setNavigator({ userAgent: FIREFOX, platform: 'Linux x86_64', maxTouchPoints: 0 })
})

describe('signed-out screen', () => {
  it('shows the hidden heading, the icon, one line, the button and the note', () => {
    render(<LoginPage locale="en" />)
    expect(screen.getByRole('heading', { level: 1, name: 'RWX' }).className).toContain('sr-only')
    const icon = document.querySelector('main img')!
    expect(icon.getAttribute('alt')).toBe('')
    expect(screen.getByText(t('en', 'login.required')).textContent).toBe('Sign in to get access.')
    expect(screen.getByRole('link', { name: t('en', 'login.signIn') }).getAttribute('href')).toBe(
      '/oauth2/authorization/github',
    )
    expect(screen.getByText(t('en', 'login.note'))).toBeTruthy()
    expect(screen.queryByText(/mock|dev login/i)).toBeNull()
  })

  it('the sidebar is decoration only: aria-hidden, inert, no nav, links or buttons, dimmed labels', () => {
    render(<LoginPage locale="en" />)
    expect(screen.queryByRole('navigation')).toBeNull()
    const side = document.querySelector('[aria-hidden="true"][inert]') as HTMLElement
    expect(side).not.toBeNull()
    expect(side.className).toContain('opacity-40')
    expect(side.querySelectorAll('button, a, nav, [aria-current]')).toHaveLength(0)
    for (const key of ['nav.media', 'nav.books', 'nav.movies', 'nav.reminders', 'nav.settings'] as const) {
      expect(within(side).getByText(t('en', key))).toBeTruthy()
    }
    // the only link and no buttons are reachable by assistive tech
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('has no bottom tab bar', () => {
    render(<LoginPage locale="en" />)
    expect(screen.queryByRole('navigation', { name: t('en', 'nav.label') })).toBeNull()
    expect(document.querySelectorAll('nav')).toHaveLength(0)
  })

  it.each(['en', 'ru', 'uk'] as Locale[])('error state in %s', (locale) => {
    render(<LoginPage error locale={locale} />)
    expect(screen.getByRole('alert').textContent).toBe(t(locale, 'login.error'))
    expect(screen.getByText(t(locale, 'login.required'))).toBeTruthy()
  })

  it('offline: notice shown, button aria-disabled and inert on click; back online restores it', () => {
    setOnline(false)
    render(<LoginPage locale="en" />)
    expect(screen.getByRole('status').textContent).toBe(t('en', 'login.offline'))
    const link = screen.getByRole('link', { name: t('en', 'login.signIn') })
    expect(link.getAttribute('aria-disabled')).toBe('true')
    expect(fireEvent.click(link)).toBe(false) // default prevented: no navigation
    act(() => {
      setOnline(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByRole('status')).toBeNull()
    expect(link.getAttribute('aria-disabled')).toBeNull()
  })

  it('redirecting: a click swaps the mark for a spinner and blocks a second click; pageshow restores', () => {
    render(<LoginPage locale="en" />)
    const link = screen.getByRole('link', { name: t('en', 'login.signIn') })
    expect(link.querySelector('svg')).not.toBeNull()
    // jsdom does not navigate; the first click must not be prevented
    expect(fireEvent.click(link)).toBe(true)
    expect(link.getAttribute('aria-disabled')).toBe('true')
    expect(link.querySelector('svg')).toBeNull()
    expect(fireEvent.click(link)).toBe(false)
    act(() => void window.dispatchEvent(new Event('pageshow')))
    expect(link.getAttribute('aria-disabled')).toBeNull()
    expect(link.querySelector('svg')).not.toBeNull()
  })

  it('leaves a deep link hash untouched', () => {
    window.history.replaceState(null, '', '/#/reminders/licenses')
    render(<LoginPage locale="en" />)
    expect(window.location.hash).toBe('#/reminders/licenses')
    expect(localStorage.length).toBe(0)
  })
})

describe('install link', () => {
  it('is hidden where install is impossible and when installed', () => {
    setNavigator({ userAgent: FIREFOX, platform: 'Linux x86_64', maxTouchPoints: 0 })
    const { unmount } = render(<LoginPage locale="en" />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    unmount()
    setNavigator({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 })
    setStandalone(true)
    render(<LoginPage locale="en" />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('on iOS opens the walkthrough sheet', () => {
    setNavigator({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 })
    render(<LoginPage locale="en" />)
    fireEvent.click(screen.getByRole('button', { name: t('en', 'install.row.ios') }))
    expect(screen.getByRole('dialog', { name: t('en', 'install.title') })).toBeTruthy()
  })

  it('with a captured browser prompt calls prompt() once and hides the link', async () => {
    setNavigator({ userAgent: ANDROID, platform: 'Linux armv81', maxTouchPoints: 5 })
    const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void> }
    e.prompt = vi.fn(() => Promise.resolve())
    act(() => void window.dispatchEvent(e))
    render(<LoginPage locale="en" />)
    fireEvent.click(screen.getByRole('button', { name: t('en', 'install.row.prompt') }))
    expect(e.prompt).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(screen.queryAllByRole('button')).toHaveLength(0))
  })
})
