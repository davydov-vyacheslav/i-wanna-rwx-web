import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { BooksScreen } from './BooksScreen'
import { cycle } from './filters'
import { fake, renderList } from './listTestUtils'
import type { Book } from './types'

const book = (o: Partial<Book> = {}) => fake<Book>(o)
// the list is aria-hidden while its sheet is open
const open = () => screen.getByRole('button', { name: /^Filters/, hidden: true })
const tri = (name: string) => screen.getByRole('checkbox', { name: new RegExp(name) })

beforeEach(() => localStorage.clear())

describe('cycle', () => {
  it('goes all -> include -> exclude -> all', () => {
    expect(cycle('all')).toBe('include')
    expect(cycle('include')).toBe('exclude')
    expect(cycle('exclude')).toBe('all')
  })
})

describe('filter sheet (books)', () => {
  it('badge shows 1 at the default, rows cycle Any -> Only -> Hide -> Any with aria-checked', async () => {
    renderList(BooksScreen, [book({ title: 'A', isFavorite: true }), book({ title: 'B' })])
    await screen.findByText('A')
    expect(open().textContent).toBe('1')
    fireEvent.click(open())
    const fav = tri('Favorite')
    expect(fav.getAttribute('aria-checked')).toBe('false')
    expect(within(fav).getByText('Any')).toBeTruthy()
    fireEvent.click(fav)
    expect(fav.getAttribute('aria-checked')).toBe('true')
    expect(within(fav).getByText('Only')).toBeTruthy()
    expect(open().textContent).toBe('2')
    expect(screen.queryByText('B')).toBeNull()
    fireEvent.click(fav)
    expect(fav.getAttribute('aria-checked')).toBe('mixed')
    expect(within(fav).getByText('Hide')).toBeTruthy()
    expect(screen.queryByText('A')).toBeNull()
    expect(screen.getByText('B')).toBeTruthy()
    fireEvent.click(fav)
    expect(fav.getAttribute('aria-checked')).toBe('false')
    expect(open().textContent).toBe('1')
  })

  it('has no type or Ended rows for books; footer shows the live count', async () => {
    renderList(BooksScreen, [book({ title: 'A' }), book({ title: 'B', status: 'seen' })])
    await screen.findByText('A')
    fireEvent.click(open())
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByText('Ended')).toBeNull()
    expect(within(dialog).queryByText('Series')).toBeNull()
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(3)
    expect(within(dialog).getByRole('button', { name: 'Show 1 of 2' })).toBeTruthy()
    fireEvent.click(tri('Read')) // seen: Hide -> Any
    expect(within(dialog).getByRole('button', { name: 'Show 2 of 2' })).toBeTruthy()
  })

  it('Reset returns to the default (seen hidden, badge 1)', async () => {
    renderList(BooksScreen, [book({ title: 'A' }), book({ title: 'B', status: 'seen' })])
    await screen.findByText('A')
    fireEvent.click(open())
    fireEvent.click(tri('Read')) // Any
    expect(screen.getByText('B')).toBeTruthy()
    fireEvent.click(tri('Draft')) // Only
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(tri('Draft').getAttribute('aria-checked')).toBe('false')
    expect(tri('Read').getAttribute('aria-checked')).toBe('mixed')
    expect(open().textContent).toBe('1')
    expect(screen.queryByText('B')).toBeNull()
  })

  it('Done closes the sheet', async () => {
    renderList(BooksScreen, [book({ title: 'A' })])
    await screen.findByText('A')
    fireEvent.click(open())
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('the filter button says how many filters are active', async () => {
    renderList(BooksScreen, [book({ title: 'A' })])
    await screen.findByText('A')
    expect(open().getAttribute('aria-label')).toBe('Filters, 1 active')
  })
})

describe('sort menu', () => {
  it('has two radios, applies the choice, closes, and the choice persists', async () => {
    const a = book({ title: 'Alpha', updatedAt: '2026-01-01T00:00:00Z' })
    const z = book({ title: 'Zulu', updatedAt: '2026-03-01T00:00:00Z' })
    renderList(BooksScreen, [a, z])
    await screen.findByText('Alpha')
    const titles = () => screen.getAllByRole('listitem').map((li) => li.textContent?.match(/Alpha|Zulu/)?.[0])
    expect(titles()).toEqual(['Alpha', 'Zulu'])
    fireEvent.click(screen.getByRole('button', { name: 'Sort' }))
    const radios = within(screen.getByRole('dialog')).getAllByRole('radio')
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('radio', { name: 'Recently changed' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(titles()).toEqual(['Zulu', 'Alpha'])
    fireEvent.click(screen.getByRole('button', { name: 'Sort' }))
    expect(
      within(screen.getByRole('dialog')).getByRole('radio', { name: 'Recently changed' }).getAttribute('aria-checked'),
    ).toBe('true')
  })
})
