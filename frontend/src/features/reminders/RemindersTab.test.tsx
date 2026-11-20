import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiClient } from '../../api/client'
import { t, type Locale } from '../../i18n'
import { json, ME, settings } from '../../test/fixtures'
import { AppShell } from '../shell/AppShell'
import { storageKey } from './listState'
import { todayIn } from './urgency'

/** `YYYY-MM-DD` this many days from today in UTC (the test settings use UTC). */
function inDays(n: number): string {
  const d = new Date(todayIn('UTC') + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

let n = 0
function item(name: string, expiryDate: string | null, over: Record<string, unknown> = {}) {
  n++
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    name,
    renewalPattern: expiryDate ? 'monthly' : 'lifetime',
    expiryDate,
    remindDaysBefore: 3,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function mount(data: { subscriptions?: unknown[]; licenses?: unknown[] } = {}, locale: Locale = 'en') {
  const store = { subscriptions: [...(data.subscriptions ?? [])], licenses: [...(data.licenses ?? [])] }
  const calls: string[] = []
  const api = createApiClient({
    baseUrl: 'http://localhost',
    csrfToken: () => 'tok',
    fetch: async (input, init) => {
      const req = input instanceof Request ? input : new Request(input, init)
      const path = new URL(req.url).pathname
      calls.push(`${req.method} ${path}`)
      if (path.endsWith('/settings')) return json(settings({ timeZone: 'UTC' }))
      const type = path.includes('/licenses') ? 'licenses' : 'subscriptions'
      if (req.method === 'DELETE') {
        const id = path.split('/').pop()
        store[type] = store[type].filter((x) => (x as { id: string }).id !== id)
        return new Response(null, { status: 204 })
      }
      return json(store[type])
    },
  })
  const utils = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AppShell me={ME} api={api} locale={locale} />
    </QueryClientProvider>,
  )
  return { calls, ...utils }
}

const navs = () => screen.getAllByRole('navigation', { name: t('en', 'nav.label') })
const sidebar = () => within(navs()[0]!)
const bar = () => within(navs()[1]!)
// the phone control; the sidebar's sub-items (same names) are a list, not a group
const segment = (name: string) =>
  within(screen.getByRole('group', { name: t('en', 'reminders.segments') })).getByRole('button', { name })
const open = () => window.history.replaceState(null, '', '/#/reminders/subscriptions')

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

describe('Reminders tab in the shell', () => {
  it('has a fourth entry in the bar and the sidebar; a tap highlights it and writes the full route', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Books' })
    fireEvent.click(bar().getByRole('button', { name: 'Reminders' }))
    await screen.findByRole('heading', { name: 'Reminders', level: 1 })
    expect(window.location.hash).toBe('#/reminders/subscriptions')
    expect(bar().getByRole('button', { name: 'Reminders' }).getAttribute('aria-current')).toBe('page')
    // in the sidebar the Subscriptions sub-item is the announced current page
    expect(sidebar().getByRole('button', { name: 'Subscriptions' }).getAttribute('aria-current')).toBe('true')
    expect(localStorage.getItem('rwx.tab.u1')).toBe('reminders')
  })

  it('the tab tap resolves to the remembered segment', async () => {
    localStorage.setItem(
      storageKey(ME.id),
      JSON.stringify({ segment: 'licenses', expiring: { subscriptions: 'all', licenses: 'all' } }),
    )
    mount()
    await screen.findByRole('heading', { name: 'Books' })
    fireEvent.click(sidebar().getByRole('button', { name: 'Reminders' }))
    expect(window.location.hash).toBe('#/reminders/licenses')
    expect(segment('Licenses').getAttribute('aria-pressed')).toBe('true')
  })

  it('a bare or unknown hash is rewritten to the remembered segment', async () => {
    window.history.replaceState(null, '', '/#/reminders')
    mount()
    await screen.findByRole('heading', { name: 'Reminders', level: 1 })
    expect(window.location.hash).toBe('#/reminders/subscriptions')
    cleanup()
    window.history.replaceState(null, '', '/#/reminders/bogus')
    mount()
    await screen.findByRole('heading', { name: 'Reminders', level: 1 })
    expect(window.location.hash).toBe('#/reminders/subscriptions')
  })

  it('a corrupt stored value gives Subscriptions', async () => {
    localStorage.setItem(storageKey(ME.id), '{"segment":"nope"}')
    open()
    mount()
    await screen.findByRole('heading', { name: 'Reminders', level: 1 })
    expect(segment('Subscriptions').getAttribute('aria-pressed')).toBe('true')
  })

  it('a segment in the hash wins over the remembered one', async () => {
    window.history.replaceState(null, '', '/#/reminders/licenses')
    mount()
    await waitFor(() => expect(segment('Licenses').getAttribute('aria-pressed')).toBe('true'))
    expect(JSON.parse(localStorage.getItem(storageKey(ME.id))!).segment).toBe('licenses')
  })

  it('switching segments replaces the history entry, remembers the choice and ignores a tap on the selected one', async () => {
    open()
    mount({ subscriptions: [item('Netflix', inDays(30))], licenses: [item('IDE', inDays(30))] })
    await screen.findByText('Netflix')
    const length = window.history.length
    fireEvent.click(segment('Licenses'))
    expect(window.location.hash).toBe('#/reminders/licenses')
    expect(window.history.length).toBe(length)
    await screen.findByText('IDE')
    // the other segment stays mounted but hidden and inert
    expect(screen.getByText('Netflix').closest('[hidden]')?.hasAttribute('inert')).toBe(true)
    expect(JSON.parse(localStorage.getItem(storageKey(ME.id))!).segment).toBe('licenses')
    fireEvent.click(segment('Licenses'))
    expect(segment('Licenses').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(segment('Subscriptions'))
    expect(screen.getByText('Netflix').closest('[hidden]')).toBeNull()
  })

  it('the last segment is restored on the next launch', async () => {
    open()
    mount()
    fireEvent.click(
      await within(await screen.findByRole('group', { name: t('en', 'reminders.segments') })).findByRole('button', {
        name: 'Licenses',
      }),
    )
    cleanup()
    window.history.replaceState(null, '', '/')
    mount()
    // the tab itself is restored too, so the screen opens straight on the last segment
    await screen.findByRole('heading', { name: 'Reminders', level: 1 })
    expect(segment('Licenses').getAttribute('aria-pressed')).toBe('true')
  })
})

describe('Reminders list', () => {
  it('shows the count and the urgency badges, ordered by expiry', async () => {
    open()
    mount({
      subscriptions: [
        item('Gym', inDays(40)),
        item('Music', inDays(0)),
        item('Cloud', inDays(1)),
        item('Video', inDays(9)),
        item('Old', inDays(-3)),
        item('Domain', null),
      ],
    })
    await screen.findByText('Gym')
    expect(screen.getByText('6')).toBeTruthy()
    const names = within(screen.getByRole('main'))
      .getAllByRole('listitem')
      .map((li) => li.querySelector('span')!.textContent)
    expect(names).toEqual(['Old', 'Music', 'Cloud', 'Video', 'Gym', 'Domain'])
    expect(screen.getByText('Expired')).toBeTruthy()
    expect(screen.getByText('Today')).toBeTruthy()
    expect(screen.getByText('1 day')).toBeTruthy()
    expect(screen.getByText('9 days')).toBeTruthy()
    expect(screen.getByText('Forever')).toBeTruthy()
    // 40 days: no badge
    expect(screen.getAllByText(/day|Today|Expired|Forever/)).toHaveLength(5)
  })

  it('uses plural forms of the locale', async () => {
    open()
    mount({ subscriptions: [item('A', inDays(2)), item('B', inDays(5)), item('C', inDays(14))] }, 'ru')
    await screen.findByText('2 дня')
    expect(screen.getByText('5 дней')).toBeTruthy()
    expect(screen.getByText('14 дней')).toBeTruthy()
  })

  it('shows a sortable table, the section title and no filter from md up', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('min-width'),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }))
    try {
      open()
      mount({ subscriptions: [item('Netflix', '2026-04-15')] })
      await screen.findByText('Netflix')
      expect(screen.getByRole('table')).toBeTruthy()
      // the sidebar names the sections, so the page title is the section, and the table sorts instead of filtering
      expect(screen.getByRole('heading', { level: 1, name: 'Subscriptions' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Filters' })).toBeNull()
      expect(screen.queryByText('1')).toBeNull()
      expect(screen.queryByText('Apr 15, 2026 · Monthly')).toBeNull()
      // the header Add button replaces the floating one
      expect(screen.getAllByRole('button', { name: 'Add subscription' })).toHaveLength(1)
      expect(screen.getByRole('button', { name: 'Add subscription' }).textContent).toBe('Add')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('the meta line has the date, the pattern and the cost', async () => {
    open()
    mount({ subscriptions: [item('Netflix', '2026-04-15', { cost: '9.99 USD' })] })
    await screen.findByText('Apr 15, 2026 · Monthly · 9.99 USD')
  })

  it('cycles the expiring-soon filter, shows "shown of total" and the badge number', async () => {
    open()
    mount({ subscriptions: [item('Soon', inDays(5)), item('Later', inDays(60)), item('Past', inDays(-1))] })
    await screen.findByText('Soon')
    expect(screen.getByRole('button', { name: 'Filters' }).textContent).not.toMatch(/\d/)
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const row = screen.getByRole('checkbox', { name: /Expiring soon/ })
    fireEvent.click(row)
    expect(row.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('button', { name: 'Show 1 of 3' })).toBeTruthy()
    fireEvent.click(row)
    expect(row.getAttribute('aria-checked')).toBe('mixed')
    expect(screen.getByRole('button', { name: 'Show 2 of 3' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('2 of 3')).toBeTruthy()
    expect(screen.queryByText('Soon')).toBeNull()
    const button = screen.getByRole('button', { name: 'Filters, 1 active' })
    expect(button.textContent).toBe('1')
    // reset in the sheet
    fireEvent.click(button)
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy()
  })

  it('each segment has its own filter', async () => {
    open()
    mount({ subscriptions: [item('Soon', inDays(5))], licenses: [item('Key', inDays(5))] })
    await screen.findByText('Soon')
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Expiring soon/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Expiring soon/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(await screen.findByText('Nothing matches')).toBeTruthy()
    expect(screen.getByText('0 of 1')).toBeTruthy()
    fireEvent.click(segment('Licenses'))
    expect(await screen.findByText('Key')).toBeTruthy()
    fireEvent.click(segment('Subscriptions'))
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(await screen.findByText('Soon')).toBeTruthy()
  })

  it('shows the empty state per segment and no count', async () => {
    open()
    mount()
    await screen.findByText('No subscriptions yet')
    expect(screen.getByText('Track what renews and when.')).toBeTruthy()
    fireEvent.click(segment('Licenses'))
    await screen.findByText('No licenses yet')
  })

  it('swipe delete asks first, then removes the row', async () => {
    open()
    const { calls } = mount({ subscriptions: [item('Netflix', inDays(30))] })
    await screen.findByText('Netflix')
    fireEvent.click(screen.getByRole('button', { name: 'Delete Netflix' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))
    expect(calls.some((c) => c.startsWith('DELETE'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Netflix' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    await screen.findByText('No subscriptions yet')
    expect(calls.filter((c) => c.startsWith('DELETE'))).toHaveLength(1)
  })
})
