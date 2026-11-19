import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { json } from '../../test/fixtures'
import { BooksScreen } from './BooksScreen'
import { defaultFilters } from './filters'
import { storageKey } from './listState'
import { fake, renderList, USER as U } from './listTestUtils'
import type { Book } from './types'

const book = (o: Partial<Book> = {}) => fake<Book>(o)
const setup = (initial: Book[], respond?: (req: Request) => Response | Promise<Response> | undefined) =>
  renderList(BooksScreen, initial, 'en', respond)

beforeEach(() => {
  localStorage.clear()
})

describe('BooksScreen', () => {
  it('shows "shown of total" when narrowed by the default filter, else the total', async () => {
    setup([book({ title: 'A' }), book({ title: 'B' }), book({ title: 'C', status: 'seen' })])
    await screen.findByText('A')
    expect(screen.getByText('2 of 3')).toBeTruthy()
    expect(screen.queryByText('C')).toBeNull()
  })

  it('shows only the total when nothing is narrowed', async () => {
    localStorage.setItem(
      storageKey('books', U),
      JSON.stringify({ filters: { ...defaultFilters(), seen: 'all' }, sort: 'titleAsc', search: '' }),
    )
    setup([book({ title: 'A' }), book({ title: 'C', status: 'seen' })])
    await screen.findByText('A')
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('search narrows and updates the count', async () => {
    setup([book({ title: 'Dune' }), book({ title: 'Emma' })])
    await screen.findByText('Dune')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'dun' } })
    expect(screen.getByText('1 of 2')).toBeTruthy()
    expect(screen.queryByText('Emma')).toBeNull()
  })

  it('renders card content: em dash, N/A, no author, badges; rating to one decimal', async () => {
    setup([
      book({ title: 'Bare' }),
      book({
        title: 'Rated',
        year: 1965,
        rating: 4.25,
        author: 'Herbert',
        source: 'open_library',
        externalId: 'OL1W',
        externalLink: 'https://openlibrary.org/works/OL1W',
      }),
    ])
    const bare = (await screen.findByText('Bare')).closest('li')!
    expect(within(bare).getByText('—')).toBeTruthy()
    expect(within(bare).getByText('N/A')).toBeTruthy()
    expect(within(bare).getByText('No author')).toBeTruthy()
    expect(within(bare).getByText('Draft')).toBeTruthy()
    expect(within(bare).getByText('Planned')).toBeTruthy()
    const rated = screen.getByText('Rated').closest('li')!
    expect(within(rated).getByText('1965')).toBeTruthy()
    expect(within(rated).getByText('4.3')).toBeTruthy()
    expect(within(rated).getByText('Herbert')).toBeTruthy()
    expect(within(rated).getByText('Open Library')).toBeTruthy()
  })

  it('heart PATCHes isFavorite through the repository', async () => {
    const b = book({ title: 'Dune' })
    const { calls } = setup([b])
    await screen.findByText('Dune')
    fireEvent.click(screen.getByRole('button', { name: 'Favorite' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeTruthy())
    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch.path).toBe(`/api/v1/books/${b.id}`)
    expect(patch.body).toEqual({ isFavorite: true, version: 1 })
  })

  it('eye PATCHes status and the item leaves the list under the default filter', async () => {
    const b = book({ title: 'Dune' })
    const { calls } = setup([b, book({ title: 'Emma' })])
    await screen.findByText('Dune')
    fireEvent.click(within(screen.getByText('Dune').closest('li')!).getByRole('button', { name: 'Mark as read' }))
    await waitFor(() => expect(screen.queryByText('Dune')).toBeNull())
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ status: 'seen', version: 1 })
    expect(screen.getByText('1 of 2')).toBeTruthy()
  })

  it('cover links to the stored externalLink (provider page or Google link); a non-https link is not a link', async () => {
    setup([
      book({
        title: 'Dune',
        source: 'open_library',
        externalId: 'OL45804W',
        externalLink: 'https://openlibrary.org/works/OL45804W',
      }),
      book({ title: 'My draft' }),
      book({ title: 'Evil', externalLink: 'javascript:alert(1)' }),
      book({ title: 'Plain http', externalLink: 'http://example.com/x' }),
    ])
    await screen.findByText('Dune')
    const dune = screen.getByRole('link', { name: /Dune/ })
    expect(dune.getAttribute('href')).toBe('https://openlibrary.org/works/OL45804W')
    expect(dune.getAttribute('target')).toBe('_blank')
    expect(dune.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getByRole('link', { name: /My draft/ }).getAttribute('href')).toBe(
      'https://www.google.com/search?q=My%20draft',
    )
    expect(screen.queryByRole('link', { name: /Evil/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Plain http/ })).toBeNull()
  })

  it('source badge comes from source: translated ids, an unknown id shown as is', async () => {
    setup([
      book({ title: 'A', source: 'open_library', externalId: 'OL1W' }),
      book({ title: 'B', source: 'goodreads' as never, externalId: '1' }),
    ])
    expect(within((await screen.findByText('A')).closest('li')!).getByText('Open Library')).toBeTruthy()
    expect(within(screen.getByText('B').closest('li')!).getByText('goodreads')).toBeTruthy()
  })

  it('card text opens the detail sheet, with or without a description', async () => {
    setup([book({ title: 'Dune', description: 'Spice.' }), book({ title: 'Plain' })])
    fireEvent.click(await screen.findByText('Dune'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Spice.')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByText('Plain'))
    expect(within(screen.getByRole('dialog')).getByText('No description.')).toBeTruthy()
  })

  it('delete from the card asks first, then sends DELETE and removes the card', async () => {
    const b = book({ title: 'Dune' })
    const { calls } = setup([b, book({ title: 'Emma' })])
    await screen.findByText('Dune')
    fireEvent.click(screen.getByRole('button', { name: 'Delete Dune' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByText('Dune')).toBeNull())
    expect(calls.some((c) => c.method === 'DELETE' && c.path === `/api/v1/books/${b.id}`)).toBe(true)
  })

  it('delete from the detail sheet closes it', async () => {
    setup([book({ title: 'Dune' })])
    fireEvent.click(await screen.findByText('Dune'))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByText('No books yet')).toBeTruthy()
  })

  it('empty library: prompt, Add button, no count', async () => {
    setup([])
    expect(await screen.findByText('No books yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add a book' })).toBeTruthy()
    expect(document.querySelector('[aria-live="polite"]')!.textContent).toBe('')
  })

  it('everything filtered out shows "Nothing matches" and Reset restores the default', async () => {
    localStorage.setItem(
      storageKey('books', U),
      JSON.stringify({ filters: { ...defaultFilters(), favorite: 'include' }, sort: 'titleAsc', search: '' }),
    )
    setup([book({ title: 'Dune' })])
    expect(await screen.findByText('Nothing matches')).toBeTruthy()
    expect(screen.getByText('0 of 1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    expect(await screen.findByText('Dune')).toBeTruthy()
  })

  it.each([
    [409, { code: 'duplicate', existingId: 'x' }, 'Already in your library.'],
    [410, { code: 'gone' }, 'This item was already deleted.'],
    [404, { code: 'not_found' }, 'Item not found. The list was refreshed.'],
    [500, { code: 'oops' }, 'Something went wrong. Please try again.'],
  ])('PATCH %i shows a toast and keeps the item', async (status, body, message) => {
    setup([book({ title: 'Dune' })], (req) => (req.method === 'PATCH' ? json(body, status) : undefined))
    await screen.findByText('Dune')
    fireEvent.click(screen.getByRole('button', { name: 'Favorite' }))
    expect((await screen.findByRole('alert')).textContent).toContain(message)
    expect(screen.getByRole('button', { name: 'Favorite' })).toBeTruthy()
  })

  it('network failure shows the offline toast and queues nothing', async () => {
    let fail = false
    const { calls } = setup([book({ title: 'Dune' })], (req) => {
      if (req.method === 'DELETE' && fail) throw new TypeError('offline')
      return undefined
    })
    await screen.findByText('Dune')
    fail = true
    fireEvent.click(screen.getByRole('button', { name: 'Delete Dune' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    expect((await screen.findByRole('alert')).textContent).toContain('No connection')
    expect(screen.getByText('Dune')).toBeTruthy()
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1)
  })

  it('favorite toggles before the server answers', async () => {
    let release: (r: Response) => void = () => {}
    setup([book({ title: 'Dune' })], (req) =>
      req.method === 'PATCH' ? new Promise<Response>((r) => (release = r)) : undefined,
    )
    await screen.findByText('Dune')
    fireEvent.click(screen.getByRole('button', { name: 'Favorite' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeTruthy())
    release(json({ code: 'oops' }, 500))
    expect((await screen.findByRole('alert')).textContent).toContain('Something went wrong')
    expect(screen.getByRole('button', { name: 'Favorite' })).toBeTruthy()
  })

  it('load failure shows Retry', async () => {
    setup([], () => json({ code: 'x' }, 500))
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load your list')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })
})
