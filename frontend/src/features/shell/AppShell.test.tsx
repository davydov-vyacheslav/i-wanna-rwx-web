import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiClient } from '../../api/client'
import { t } from '../../i18n'
import type { Me } from '../identity/useMe'
import { AppShell } from './AppShell'
import { json } from '../../test/fixtures'

const me = { id: 'u1', displayName: 'octo' } as Me

const requests: string[] = []

function mount(locale: 'en' | 'ru' | 'uk' = 'en') {
  const api = createApiClient({
    baseUrl: 'http://localhost',
    fetch: (input) => {
      requests.push(new Request(input).url)
      return Promise.resolve(json([]))
    },
  })
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AppShell me={me} api={api} locale={locale} />
    </QueryClientProvider>,
  )
}

const navs = () => screen.getAllByRole('navigation', { name: t('en', 'nav.label') })
// jsdom has no CSS: both navs are in the tree; the sidebar comes first (hidden below md), the bottom bar last (hidden from md)
const sidebar = () => within(navs()[0]!)
const tabs = () => within(navs()[1]!)

beforeEach(() => {
  requests.length = 0
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

describe('AppShell', () => {
  it('renders the bottom bar and the sidebar, each hidden by a breakpoint class, with the same entries', async () => {
    mount()
    const [side, bar] = navs()
    expect(navs()).toHaveLength(2)
    expect(side!.className).toMatch(/\bhidden\b.*\bmd:block\b/)
    expect(bar!.className).toMatch(/\bmd:hidden\b/)
    expect(
      sidebar()
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Books', 'Movies', 'Settings'])
    for (const nav of [sidebar(), tabs()])
      expect(nav.getByRole('button', { name: 'Books' }).getAttribute('aria-current')).toBe('page')
    await screen.findByRole('heading', { name: 'Books' })
  })

  it('the sidebar navigates by hash and highlights the current entry in both navs', async () => {
    mount()
    fireEvent.click(sidebar().getByRole('button', { name: 'Movies' }))
    await screen.findByRole('heading', { name: 'Movies', level: 1 })
    expect(window.location.hash).toBe('#/movies')
    expect(localStorage.getItem('rwx.tab.u1')).toBe('movies')
    for (const nav of [sidebar(), tabs()]) {
      expect(nav.getByRole('button', { name: 'Movies' }).getAttribute('aria-current')).toBe('page')
      expect(nav.getByRole('button', { name: 'Books' }).hasAttribute('aria-current')).toBe(false)
    }
    expect(sidebar().getByRole('button', { name: 'Movies' }).className).toContain('text-accent')
  })

  it('renders three tabs; Books is current at first', async () => {
    mount()
    const buttons = tabs().getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Books', 'Movies', 'Settings'])
    expect(tabs().getByRole('button', { name: 'Books' }).getAttribute('aria-current')).toBe('page')
    expect(buttons.filter((b) => b.hasAttribute('aria-current'))).toHaveLength(1)
    await screen.findByRole('heading', { name: 'Books' })
  })

  it('one tap reaches Movies and Settings and moves aria-current', async () => {
    mount()
    fireEvent.click(tabs().getByRole('button', { name: 'Movies' }))
    await screen.findByRole('heading', { name: 'Movies', level: 1 })
    expect(tabs().getByRole('button', { name: 'Movies' }).getAttribute('aria-current')).toBe('page')
    expect(tabs().getByRole('button', { name: 'Books' }).hasAttribute('aria-current')).toBe(false)
    fireEvent.click(tabs().getByRole('button', { name: 'Settings' }))
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeTruthy()
    expect(tabs().getByRole('button', { name: 'Settings' }).getAttribute('aria-current')).toBe('page')
    expect(screen.queryByRole('heading', { name: 'Movies', level: 1 })).toBeNull()
  })

  it('the tab lives in the hash, so a reload or Back keeps it', async () => {
    window.history.replaceState(null, '', '/#/movies')
    mount()
    await screen.findByRole('heading', { name: 'Movies', level: 1 })
    fireEvent.click(tabs().getByRole('button', { name: 'Settings' }))
    expect(window.location.hash).toBe('#/settings')
  })

  it('first launch (no hash, nothing stored) opens Books', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Books' })
    expect(tabs().getByRole('button', { name: 'Books' }).getAttribute('aria-current')).toBe('page')
  })

  it('restores the last active tab of this user when there is no hash', async () => {
    mount()
    fireEvent.click(tabs().getByRole('button', { name: 'Movies' }))
    await screen.findByRole('heading', { name: 'Movies', level: 1 })
    cleanup()
    window.history.replaceState(null, '', '/')
    mount()
    await screen.findByRole('heading', { name: 'Movies', level: 1 })
    expect(tabs().getByRole('button', { name: 'Movies' }).getAttribute('aria-current')).toBe('page')
    expect(localStorage.getItem('rwx.tab.u1')).toBe('movies')
  })

  it('Back to the launch entry (empty hash) returns to the restored tab, not Books', async () => {
    localStorage.setItem('rwx.tab.u1', 'movies')
    mount()
    await screen.findByRole('heading', { name: 'Movies', level: 1 })
    fireEvent.click(tabs().getByRole('button', { name: 'Settings' }))
    await screen.findByRole('heading', { name: 'Settings', level: 1 })
    window.history.replaceState(null, '', '/')
    fireEvent(window, new HashChangeEvent('hashchange'))
    await screen.findByRole('heading', { name: 'Movies', level: 1 })
    expect(tabs().getByRole('button', { name: 'Movies' }).getAttribute('aria-current')).toBe('page')
  })

  it('the stored tab is per user', async () => {
    localStorage.setItem('rwx.tab.other', 'movies')
    mount()
    await screen.findByRole('heading', { name: 'Books' })
    expect(tabs().getByRole('button', { name: 'Books' }).getAttribute('aria-current')).toBe('page')
  })

  it('a corrupt stored value opens Books', async () => {
    localStorage.setItem('rwx.tab.u1', 'reminders')
    mount()
    await screen.findByRole('heading', { name: 'Books' })
    expect(tabs().getByRole('button', { name: 'Books' }).getAttribute('aria-current')).toBe('page')
  })

  it('the hash wins over the stored tab', async () => {
    localStorage.setItem('rwx.tab.u1', 'movies')
    window.history.replaceState(null, '', '/#/settings')
    mount()
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeTruthy()
  })

  it('tapping the current tab scrolls the region to the top', () => {
    mount()
    const region = screen.getByRole('main')
    const scrollTo = vi.fn()
    region.scrollTo = scrollTo as unknown as typeof region.scrollTo
    fireEvent.click(tabs().getByRole('button', { name: 'Books' }))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  it('tab labels follow the locale', () => {
    mount('uk')
    for (const nav of screen.getAllByRole('navigation'))
      expect(
        within(nav)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Книги', 'Фільми', 'Налаштування'])
  })

  it('the tab bar sits in the safe area (tab target size is a ux-review item: jsdom has no layout)', () => {
    mount()
    const nav = navs()[1]!
    expect(nav.className).toContain('pb-[env(safe-area-inset-bottom)]')
  })

  it('mounts a screen on its first visit only: no movies request before the Movies tab is opened', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Books' })
    expect(requests.some((u) => u.includes('/books'))).toBe(true)
    expect(requests.some((u) => u.includes('/movies'))).toBe(false)
    expect(document.querySelectorAll('section')).toHaveLength(1)
    fireEvent.click(tabs().getByRole('button', { name: 'Movies' }))
    await screen.findByRole('heading', { name: 'Movies', level: 1 })
    expect(requests.some((u) => u.includes('/movies'))).toBe(true)
  })

  it('keeps visited screens mounted: search text survives a trip to Movies and back', async () => {
    mount()
    const search = await screen.findByRole('searchbox', { name: /books/i })
    fireEvent.change(search, { target: { value: 'dune' } })
    fireEvent.click(tabs().getByRole('button', { name: 'Movies' }))
    await screen.findByRole('heading', { name: 'Movies', level: 1 })
    fireEvent.click(tabs().getByRole('button', { name: 'Books' }))
    expect((await screen.findByRole('searchbox', { name: /books/i })) as HTMLInputElement).toBe(search)
    expect((search as HTMLInputElement).value).toBe('dune')
  })

  it('caps the content width once for every tab; the tab bar stays outside the cap', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Books' })
    const cap = screen.getByRole('main').firstElementChild as HTMLElement
    expect(cap.className).toContain('max-w-[var(--column-w)]')
    expect(cap.className).toContain('mx-auto')
    for (const nav of navs()) expect(cap.contains(nav)).toBe(false)
  })

  it('inactive tabs are hidden, inert and aria-hidden; only the active one is in the accessibility tree', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Books' })
    fireEvent.click(tabs().getByRole('button', { name: 'Movies' }))
    await screen.findByRole('heading', { name: 'Movies', level: 1 })
    const panes = [...screen.getByRole('main', { hidden: true }).firstElementChild!.children] as HTMLElement[]
    expect(panes).toHaveLength(2)
    const books = panes[0]!
    const movies = panes[1]!
    expect(books.hidden).toBe(true)
    expect(books.hasAttribute('inert')).toBe(true)
    expect(books.getAttribute('aria-hidden')).toBe('true')
    expect(movies.hidden).toBe(false)
    expect(movies.hasAttribute('inert')).toBe(false)
    expect(movies.hasAttribute('aria-hidden')).toBe(false)
    expect(screen.queryByRole('heading', { name: 'Books', level: 1 })).toBeNull()
    expect(screen.queryByRole('searchbox', { name: /books/i })).toBeNull()
    expect(screen.getByRole('searchbox', { name: /movies/i })).toBeTruthy()
    // the hidden screen's FAB is not exposed either
    expect(screen.getAllByRole('button', { name: t('en', 'media.add') })).toHaveLength(1)
  })

  it('each tab keeps its own scroll offset', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Books' })
    const region = screen.getByRole('main')
    region.scrollTop = 120
    fireEvent.scroll(region)
    fireEvent.click(tabs().getByRole('button', { name: 'Movies' }))
    expect(region.scrollTop).toBe(0)
    region.scrollTop = 40
    fireEvent.scroll(region)
    fireEvent.click(tabs().getByRole('button', { name: 'Books' }))
    expect(region.scrollTop).toBe(120)
    fireEvent.click(tabs().getByRole('button', { name: 'Movies' }))
    expect(region.scrollTop).toBe(40)
  })
})
