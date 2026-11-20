import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BooksScreen } from './BooksScreen'
import { fake, renderList } from './listTestUtils'
import { MoviesScreen } from './MoviesScreen'
import type { Book, Movie } from './types'

const book = (o: Partial<Book> = {}) => fake<Book>(o)
const movie = (o: Partial<Movie> = {}) => fake<Movie>({ type: 'movie', ...o })

beforeEach(() => {
  localStorage.clear()
  // from md up: a table, no sort control
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('min-width'),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }))
})
afterEach(() => vi.unstubAllGlobals())

const titles = () => [...document.querySelectorAll('tbody [data-open] .line-clamp-2')].map((e) => e.textContent)
const headers = () => screen.getAllByRole('columnheader').map((h) => h.textContent)
const sortBy = (name: string) => fireEvent.click(within(screen.getByRole('columnheader', { name })).getByRole('button'))
const rowOf = (title: string) =>
  [...document.querySelectorAll('tbody tr')].find(
    (r) => r.querySelector('.line-clamp-2')?.textContent === title,
  ) as HTMLElement
const nameOf = (title: string) => rowOf(title).querySelector('[data-open]')

describe('Books table', () => {
  it('has the Books columns, with Year, Author and Rating from lg and Updated from xl', async () => {
    renderList(BooksScreen, [book({ title: 'Dune' })])
    await screen.findByText('Dune')
    expect(headers()).toEqual(['Title', 'Author', 'Year', 'Rating', 'Status', 'Favorite', 'Updated', 'Delete'])
    const hide = (name: string) => screen.getByRole('columnheader', { name }).className
    expect(hide('Author')).toContain('hidden lg:table-cell')
    expect(hide('Rating')).toContain('hidden lg:table-cell')
    expect(hide('Updated')).toContain('hidden xl:table-cell')
    expect(hide('Year')).toContain('hidden lg:table-cell')
  })

  it('shows author (second line below lg and a cell), year, rating and dashes for missing values', async () => {
    renderList(BooksScreen, [
      book({ title: 'Dune', author: 'Frank Herbert', year: 1965, rating: 4.3 }),
      book({ title: 'Bare' }),
    ])
    await screen.findByText('Dune')
    const dune = within(rowOf('Dune'))
    expect(dune.getAllByText('Frank Herbert')).toHaveLength(2)
    expect(dune.getByText('1965')).toBeTruthy()
    expect(dune.getByLabelText('Rating 4.3').textContent).toBe('4.3')
    const bare = within(rowOf('Bare'))
    expect(bare.getByText('No author')).toBeTruthy()
    expect(bare.getByText('No rating')).toBeTruthy()
    // a draft carries its chip under the title
    expect(bare.getByText('Draft')).toBeTruthy()
  })

  it('opens in title order and sorts by each header, first direction and missing values as designed', async () => {
    renderList(BooksScreen, [
      book({ title: 'B', author: 'Zed', year: 1990, rating: 3, isFavorite: true, updatedAt: '2026-03-01T00:00:00Z' }),
      book({ title: 'A', author: 'Amy', year: 2010, rating: 5, updatedAt: '2026-02-01T00:00:00Z' }),
      book({ title: 'C', year: 2000, updatedAt: '2026-04-01T00:00:00Z' }),
    ])
    await screen.findByText('A')
    expect(titles()).toEqual(['A', 'B', 'C'])
    sortBy('Year')
    expect(titles()).toEqual(['A', 'C', 'B'])
    sortBy('Rating')
    expect(titles()).toEqual(['A', 'B', 'C'])
    sortBy('Author')
    expect(titles()).toEqual(['A', 'B', 'C'])
    sortBy('Author')
    expect(titles()).toEqual(['B', 'A', 'C'])
    sortBy('Favorite')
    expect(titles()).toEqual(['B', 'A', 'C'])
    sortBy('Updated')
    expect(titles()).toEqual(['C', 'B', 'A'])
    sortBy('Status')
    expect(titles()).toEqual(['A', 'B', 'C'])
    sortBy('Title')
    sortBy('Title')
    expect(titles()).toEqual(['C', 'B', 'A'])
  })

  it('ignores the stored sort: the default order is by title', async () => {
    localStorage.setItem(
      'rwx.list.books.user-1',
      JSON.stringify({
        filters: { type: 'all', favorite: 'all', seen: 'all', draft: 'all', ended: 'all' },
        sort: 'updatedDesc',
        search: '',
      }),
    )
    renderList(BooksScreen, [
      book({ title: 'B', updatedAt: '2026-05-01T00:00:00Z' }),
      book({ title: 'A', updatedAt: '2026-01-01T00:00:00Z' }),
    ])
    await screen.findByText('A')
    expect(titles()).toEqual(['A', 'B'])
  })

  it('the status badge toggles read and planned; the toggled row leaves while seen is hidden', async () => {
    const { calls } = renderList(BooksScreen, [book({ title: 'A' }), book({ title: 'B' }), book({ title: 'C' })])
    await screen.findByText('A')
    const status = within(rowOf('B')).getByRole('button', { name: 'Planned, Mark as read' })
    expect(status.textContent).toBe('Planned, Mark as read')
    fireEvent.click(status)
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({ status: 'seen' }))
    // the row does not open the detail dialog
    expect(screen.queryByRole('dialog')).toBeNull()
    // it fades, then the focus lands on the row that took its place
    await waitFor(() => expect(titles()).toEqual(['A', 'C']))
    await waitFor(() => expect(document.activeElement).toBe(nameOf('C')))
  })

  it('the heart toggles the favorite and has its own labels', async () => {
    const { calls } = renderList(BooksScreen, [book({ title: 'A' })])
    await screen.findByText('A')
    fireEvent.click(within(rowOf('A')).getByRole('button', { name: 'Favorite' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({ isFavorite: true }))
    expect(await within(rowOf('A')).findByRole('button', { name: 'Remove from favorites' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('delete asks first, waits for the server, then focus goes to the row that took its place', async () => {
    const { calls } = renderList(BooksScreen, [book({ title: 'A' }), book({ title: 'B' }), book({ title: 'C' })])
    await screen.findByText('A')
    fireEvent.click(screen.getByRole('button', { name: 'Delete B' }))
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true))
    await waitFor(() => expect(titles()).toEqual(['A', 'C']))
    await waitFor(() => expect(document.activeElement).toBe(nameOf('C')))
  })

  it('deleting the last row focuses the previous one', async () => {
    renderList(BooksScreen, [book({ title: 'A' }), book({ title: 'B' })])
    await screen.findByText('A')
    fireEvent.click(screen.getByRole('button', { name: 'Delete B' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(titles()).toEqual(['A']))
    await waitFor(() => expect(document.activeElement).toBe(nameOf('A')))
  })

  it('deleting the only item leaves the empty state with its Add button focused', async () => {
    renderList(BooksScreen, [book({ title: 'A' })])
    await screen.findByText('A')
    fireEvent.click(screen.getByRole('button', { name: 'Delete A' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    await screen.findByText('No books yet')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add a book' })))
  })

  it('a click on the row opens the detail and closing it returns focus to the name button', async () => {
    renderList(BooksScreen, [book({ title: 'A', year: 1999 })])
    await screen.findByText('A')
    fireEvent.click(screen.getByText('1999'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(document.activeElement).toBe(nameOf('A')))
  })
})

describe('Movies table', () => {
  it('has no Author column, a type icon with its text before the title and the series line', async () => {
    renderList(MoviesScreen, [
      movie({ title: 'Alien', rating: 8.1 }),
      movie({ title: 'Dark', type: 'tv', tvStatus: 'ended', seasonCount: 3 }),
    ])
    await screen.findByText('Alien')
    expect(headers()).toEqual(['Title', 'Year', 'Rating', 'Status', 'Favorite', 'Updated', 'Delete'])
    expect(within(rowOf('Alien')).getByText('Movie')).toBeTruthy()
    const series = within(rowOf('Dark'))
    expect(series.getByText('Series')).toBeTruthy()
    expect(series.getByText('Status: Ended • 3 seasons')).toBeTruthy()
    // a movie's status button names the watched action
    expect(within(rowOf('Alien')).getByRole('button', { name: 'Planned, Mark as watched' })).toBeTruthy()
  })
})

describe('the wide top bar and states', () => {
  it('has the title and Add in the page header, a labelled Filters button and no Sort', async () => {
    renderList(BooksScreen, [book({ title: 'A' }), book({ title: 'B', status: 'seen' })])
    await screen.findByText('A')
    expect(screen.getByRole('heading', { level: 1, name: 'Books' })).toBeTruthy()
    // no count next to the title on wide screens (phones keep it)
    expect(screen.queryByText('1 of 2')).toBeNull()
    expect(document.querySelector('[aria-live]')).toBeNull()
    // the header button replaces the floating one
    expect(screen.getAllByRole('button', { name: /^Add/ })).toHaveLength(1)
    const add = screen.getByRole('button', { name: 'Add a book' })
    expect(add.textContent).toBe('Add')
    expect(screen.queryByRole('button', { name: 'Sort' })).toBeNull()
    const filters = screen.getByRole('button', { name: 'Filters, 1 active' })
    expect(filters.textContent).toBe('Filters1')
    expect(screen.getByRole('searchbox')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull()
  })

  it('Movies has the type segments and the More button; the filter dialog is the same', async () => {
    renderList(MoviesScreen, [movie({ title: 'Alien' }), movie({ title: 'Dark', type: 'tv' })])
    await screen.findByText('Alien')
    expect(screen.getByRole('button', { name: 'More' }).getAttribute('title')).toBe('More')
    fireEvent.click(screen.getByRole('button', { name: 'Series' }))
    await waitFor(() => expect(titles()).toEqual(['Dark']))
    expect(screen.getAllByRole('button', { name: 'Add a movie or series' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('the empty library shows only its state: no toolbar, no table, no header Add', async () => {
    renderList(BooksScreen, [])
    await screen.findByText('Add a book')
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Add a book' })).toHaveLength(1)
  })

  it('no match keeps the header and toolbar and resets', async () => {
    renderList(BooksScreen, [book({ title: 'Dune' })])
    await screen.findByText('Dune')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } })
    expect(screen.queryByText('0 of 1')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add a book' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    expect(await screen.findByText('Dune')).toBeTruthy()
  })

  it('loading shows the toolbar, a disabled header and placeholder rows, without Add or count', async () => {
    renderList(BooksScreen, [], 'en', () => new Promise<Response>(() => {}))
    expect(screen.getByRole('searchbox')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Loading your list')
    expect(screen.getByRole('button', { name: 'Title' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Add a book' })).toBeNull()
    expect(screen.getByRole('table').getAttribute('aria-busy')).toBeNull()
    expect(document.querySelectorAll('tbody tr')).toHaveLength(6)
  })

  it('a failed load shows the message and Retry in place of the toolbar and table', async () => {
    renderList(BooksScreen, [], 'en', () => new Response('x', { status: 500 }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add a book' })).toBeNull()
  })

  it('a failed load says so when offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    renderList(BooksScreen, [], 'en', () => new Response('x', { status: 500 }))
    expect((await screen.findByRole('alert')).textContent).toBe('You are offline. Check the connection and retry.')
  })
})

describe('fixed geometry', () => {
  it('every row has the same height class and thumbnail box: real cover, placeholder and draft', async () => {
    renderList(BooksScreen, [
      book({ title: 'Real', coverUrl: 'https://img.test/a.jpg' }),
      book({ title: 'Placeholder' }),
      book({ title: 'A very long draft title '.repeat(8) }),
    ])
    await screen.findByText('Real')
    const rows = [...document.querySelectorAll('tbody tr')]
    expect(rows).toHaveLength(3)
    const geometry = rows.map((r) => ({
      box: r.querySelector('td > div')!.className,
      img: (r.querySelector('img') as HTMLImageElement).style.cssText,
      clamp: r.querySelector('[data-open] .line-clamp-2') !== null,
    }))
    for (const g of geometry) {
      expect(g.box).toContain('h-[72px]')
      expect(g.img).toBe('width: 42px; height: 56px;')
      expect(g.clamp).toBe(true)
    }
  })

  it('the skeleton rows have the same height class', async () => {
    renderList(BooksScreen, [], 'en', () => new Promise<Response>(() => {}))
    expect(document.querySelector('tbody tr td > div')!.className).toContain('h-[72px]')
  })

  it('has the same toolbar and title row classes on Books and Movies', async () => {
    const rhythm = () => ({
      title: screen.getByRole('heading', { level: 1 }).parentElement!.className,
      toolbar: screen.getByRole('searchbox').closest('label')!.parentElement!.className,
    })
    const books = renderList(BooksScreen, [book({ title: 'A' })])
    await screen.findByText('A')
    const b = rhythm()
    books.unmount()
    renderList(MoviesScreen, [movie({ title: 'Alien' }), movie({ title: 'Dark', type: 'tv' })])
    await screen.findByText('Alien')
    expect(rhythm()).toEqual(b)
    expect(b.toolbar).toContain('h-14')
    expect(b.toolbar).not.toContain('flex-wrap')
  })

  it('uses a fixed table layout with a width class on every column but Name', async () => {
    renderList(BooksScreen, [book({ title: 'Dune' })])
    await screen.findByText('Dune')
    expect(screen.getByRole('table').className).toContain('table-fixed')
    const [name, ...rest] = screen.getAllByRole('columnheader')
    expect(name!.className).not.toMatch(/\bw-/)
    for (const h of rest) expect(h.className).toMatch(/\bw-\d+/)
  })

  it('the detail dialog title is one line with the full title in the tooltip and wrapped in the body', async () => {
    const long = 'A very long item name that would wrap '.repeat(4).trim()
    renderList(BooksScreen, [book({ title: long })])
    await screen.findByText(long)
    fireEvent.click(nameOf(long)!)
    const dialog = await screen.findByRole('dialog')
    const heading = within(dialog).getByRole('heading', { level: 2 })
    expect(heading.className).toContain('truncate')
    expect(heading.getAttribute('title')).toBe(long)
    expect(within(dialog).getByRole('heading', { level: 3 }).className).toContain('[overflow-wrap:anywhere]')
  })
})
