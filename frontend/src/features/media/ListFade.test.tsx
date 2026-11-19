import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BooksScreen } from './BooksScreen'
import { defaultFilters } from './filters'
import { storageKey } from './listState'
import { fake, renderList, USER } from './listTestUtils'
import { LEAVE_MS } from './motion'
import type { Book } from './types'

// Fake timers go on after the list has rendered (findBy* polls with timers); `sleep` advances them deterministically.
const sleep = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
const seenButton = (title: string) =>
  within(screen.getByText(title).closest('li')!).getByRole('button', { name: 'Mark as read' })

function reducedMotion(on: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: on && q.includes('reduce'),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }))
}

beforeEach(() => {
  localStorage.clear()
  reducedMotion(false)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('fade-out when a toggle hides the row', () => {
  it('marking seen under the default filter fades the row for LEAVE_MS, then drops it; the count updates at once', async () => {
    renderList(BooksScreen, [fake<Book>({ title: 'Dune' }), fake<Book>({ title: 'Emma' })])
    await screen.findByText('Dune')
    vi.useFakeTimers()
    const row = screen.getByText('Dune').closest('li')!
    expect(row.hasAttribute('data-leaving')).toBe(false)
    fireEvent.click(seenButton('Dune'))
    expect(row.getAttribute('data-leaving')).toBe('true')
    expect(row.className).toContain('opacity-0')
    expect(row.className).toContain('grid-rows-[0fr]')
    // still in the DOM mid-fade, even after the optimistic cache update landed
    await sleep(LEAVE_MS / 2)
    expect(screen.getByText('Dune')).toBeTruthy()
    expect(screen.getByText('1 of 2')).toBeTruthy()
    await sleep(LEAVE_MS)
    expect(screen.queryByText('Dune')).toBeNull()
    expect(screen.getByText('Emma')).toBeTruthy()
  })

  it('the fading row keeps its sort position among the others', async () => {
    renderList(BooksScreen, [fake<Book>({ title: 'A' }), fake<Book>({ title: 'B' }), fake<Book>({ title: 'C' })])
    await screen.findByText('B')
    vi.useFakeTimers()
    fireEvent.click(seenButton('B'))
    await sleep(20)
    const titles = screen
      .getAllByRole('listitem')
      .filter((li) => li.parentElement?.tagName === 'UL')
      .map((li) => li.textContent)
    expect(titles.map((x) => x?.[0])).toEqual(['A', 'B', 'C'])
  })

  it('does not fade when the filter keeps the row, and the fade also applies to a favorite toggle that gets filtered out', async () => {
    renderList(BooksScreen, [fake<Book>({ title: 'Dune' }), fake<Book>({ title: 'Emma' })])
    await screen.findByText('Dune')
    vi.useFakeTimers()
    fireEvent.click(within(screen.getByText('Dune').closest('li')!).getByRole('button', { name: 'Favorite' }))
    expect(screen.getByText('Dune').closest('li')!.hasAttribute('data-leaving')).toBe(false)
  })

  it('a favorite toggle fades out when favorites are hidden by the filter', async () => {
    localStorage.setItem(
      storageKey('books', USER),
      JSON.stringify({
        filters: { ...defaultFilters(), seen: 'all', favorite: 'exclude' },
        sort: 'titleAsc',
        search: '',
      }),
    )
    renderList(BooksScreen, [fake<Book>({ title: 'Dune' }), fake<Book>({ title: 'Emma' })])
    await screen.findByText('Dune')
    vi.useFakeTimers()
    const row = screen.getByText('Dune').closest('li')!
    fireEvent.click(within(row).getByRole('button', { name: 'Favorite' }))
    expect(row.getAttribute('data-leaving')).toBe('true')
    await sleep(LEAVE_MS)
    expect(screen.queryByText('Dune')).toBeNull()
  })

  it('prefers-reduced-motion: the row goes at once, no leaving state', async () => {
    reducedMotion(true)
    renderList(BooksScreen, [fake<Book>({ title: 'Dune' }), fake<Book>({ title: 'Emma' })])
    await screen.findByText('Dune')
    vi.useFakeTimers()
    const row = screen.getByText('Dune').closest('li')!
    fireEvent.click(seenButton('Dune'))
    expect(row.hasAttribute('data-leaving')).toBe(false)
    await sleep(0)
    expect(screen.queryByText('Dune')).toBeNull()
  })

  it('rollback on error brings the row back and cancels the fade', async () => {
    const { calls } = renderList(
      BooksScreen,
      [fake<Book>({ title: 'Dune' }), fake<Book>({ title: 'Emma' })],
      'en',
      (req) =>
        req.method === 'PATCH'
          ? new Response(JSON.stringify({ code: 'x' }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            })
          : undefined,
    )
    await screen.findByText('Dune')
    vi.useFakeTimers()
    const row = screen.getByText('Dune').closest('li')!
    fireEvent.click(seenButton('Dune'))
    expect(row.getAttribute('data-leaving')).toBe('true')
    await sleep(10) // the failed PATCH settles
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(row.hasAttribute('data-leaving')).toBe(false)
    await sleep(LEAVE_MS + 80) // the old timer must not drop it later
    expect(screen.getByText('Dune').closest('li')).toBe(row)
    expect(row.className).toContain('opacity-100')
    expect(screen.getByText('2')).toBeTruthy()
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1)
  })
})
