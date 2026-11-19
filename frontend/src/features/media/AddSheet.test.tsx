import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AddSheet } from './AddSheet'
import { createApiClient } from '../../api/client'
import { json } from '../../test/fixtures'
import type { DataSource } from '../settings/useDataSources'
import { createMediaRepository } from './repository'
import { draftLink } from './sourceUrl'
import { BooksScreen } from './BooksScreen'
import { fake, renderList } from './listTestUtils'
import type { LibraryItem } from './duplicates'
import { MoviesScreen } from './MoviesScreen'
import type { Book, Movie } from './types'

beforeEach(() => localStorage.clear())

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const json500 = () => json({ code: 'x' }, 500)
const posts = (calls: { method: string }[]) =>
  calls.filter((c) => c.method === 'POST') as { method: string; path: string; body: Record<string, unknown> }[]

/** Row taps are ignored for 300 ms after the list changed (AddSheet); wait it out before tapping. */
const settle = () => new Promise((r) => setTimeout(r, 350))

/** Waits for the list to load (the in-library check reads it), then taps the FAB. */
async function openAdd(loaded?: string) {
  if (loaded) await screen.findByText(loaded)
  fireEvent.click(await screen.findByRole('button', { name: 'Add' }))
  return screen.getByRole('dialog')
}

describe('add sheet (books)', () => {
  it('opens from the FAB with the title field focused and the min-3 hint', async () => {
    renderList(BooksScreen, [fake<Book>({ title: 'Emma' })])
    const dialog = await openAdd()
    const input = within(dialog).getByRole('textbox', { name: 'Book title' })
    expect(document.activeElement).toBe(input)
    expect(within(dialog).getByText('Type at least 3 characters to search.')).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: /as draft/ })).toBeNull()
    expect(input.getAttribute('maxlength')).toBe('200')
    fireEvent.change(input, { target: { value: 'Dun' } })
    expect(within(dialog).queryByText('Type at least 3 characters to search.')).toBeNull()
    expect(within(dialog).queryByText("Can't find it?")).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Add "Dun" as draft' })).toBeTruthy()
  })

  it('the list behind is inert and hidden from assistive tech while the sheet is open, and restored on close', async () => {
    renderList(BooksScreen, [fake<Book>({ title: 'Emma' })])
    const dialog = await openAdd('Emma')
    const search = () => screen.getByRole('searchbox', { hidden: true })
    expect(search().closest('[inert][aria-hidden="true"]')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(search().closest('[inert]')).toBeNull()
    expect(search().closest('[aria-hidden]')).toBeNull()
  })

  it('opens from the empty-state button too', async () => {
    renderList(BooksScreen, [])
    fireEvent.click(await screen.findByRole('button', { name: 'Add a book' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('creates a draft with exactly {id, sourceUrl} (the Google link of the trimmed text); closes and shows the card', async () => {
    const { calls } = renderList(BooksScreen, [fake<Book>({ title: 'Emma' })])
    const dialog = await openAdd()
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '  Dune Messiah ' } })
    await settle()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add "Dune Messiah" as draft' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const [post] = posts(calls)
    expect(post!.path).toBe('/api/v1/books')
    expect(Object.keys(post!.body).sort()).toEqual(['id', 'sourceUrl'])
    expect(post!.body.id).toMatch(UUID)
    expect(post!.body.sourceUrl).toBe('https://www.google.com/search?q=Dune%20Messiah')
    const card = (await screen.findByText('Dune Messiah')).closest('li')!
    expect(within(card).getByText('Planned')).toBeTruthy()
    expect(within(card).getByText('Draft')).toBeTruthy()
  })

  it('the sourceUrl equals draftLink of the typed text (&, ?, #, space, Cyrillic, emoji)', async () => {
    const { calls } = renderList(BooksScreen, [])
    fireEvent.click(await screen.findByRole('button', { name: 'Add a book' }))
    const text = 'Тест & why? #1 \u{1F600}'
    fireEvent.change(screen.getByRole('textbox'), { target: { value: text } })
    await settle()
    fireEvent.click(screen.getByRole('button', { name: `Add "${text}" as draft` }))
    await waitFor(() => expect(posts(calls)).toHaveLength(1))
    expect(posts(calls)[0]!.body.sourceUrl).toBe(draftLink(text))
    expect(String(posts(calls)[0]!.body.sourceUrl)).toContain('%26')
  })

  it('a title equal to a library title renders no draft entry at all (case, NFD vs NFC, trailing space)', async () => {
    const { calls } = renderList(BooksScreen, [fake<Book>({ title: 'Dune' }), fake<Book>({ title: 'Café' })])
    const dialog = await openAdd('Dune')
    const input = within(dialog).getByRole('textbox')
    fireEvent.change(input, { target: { value: ' dune ' } })
    expect(within(dialog).queryByRole('button', { name: /as draft/ })).toBeNull()
    expect(within(dialog).queryByRole('status')).toBeNull()
    fireEvent.change(input, { target: { value: 'Café ' } })
    expect(within(dialog).queryByRole('button', { name: /as draft/ })).toBeNull()
    fireEvent.change(input, { target: { value: 'Dune II' } })
    expect(within(dialog).getByRole('button', { name: 'Add "Dune II" as draft' })).toBeTruthy()
    expect(posts(calls)).toHaveLength(0)
  })

  it('hiding the draft entry leaves a plain "Already in your library" line that is not interactive', async () => {
    renderList(BooksScreen, [fake<Book>({ title: 'Dune' })])
    const dialog = await openAdd('Dune')
    expect(within(dialog).queryByText('Already in your library')).toBeNull()
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'DUNE' } })
    const line = within(dialog).getByText('Already in your library')
    expect(line.closest('button')).toBeNull()
    expect(line.closest('li')).toBeNull()
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Dune 2' } })
    expect(within(dialog).queryByText('Already in your library')).toBeNull()
  })

  it('a draft already in the library hides the entry too', async () => {
    renderList(BooksScreen, [fake<Book>({ title: 'My draft' })])
    const dialog = await openAdd('My draft')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'my draft' } })
    expect(within(dialog).queryByRole('button', { name: /as draft/ })).toBeNull()
    expect(within(dialog).getByText('Already in your library')).toBeTruthy()
  })

  it('a failed create shows the toast, keeps the sheet open and retries with the same id', async () => {
    let fail = true
    const { calls } = renderList(BooksScreen, [], 'en', (req) =>
      req.method === 'POST' && fail ? json500() : undefined,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Add a book' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Emma' } })
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Add "Emma" as draft' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Something went wrong')
    expect(screen.getByRole('dialog')).toBeTruthy()
    fail = false
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Add "Emma" as draft' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const [a, b] = posts(calls)
    expect(a!.body.id).toBe(b!.body.id)
    expect(a!.body.sourceUrl).toBe(b!.body.sourceUrl)
  })

  it('409 duplicate closes the sheet and opens the existing item', async () => {
    const existing = fake<Book>({ title: 'Emma' })
    renderList(BooksScreen, [existing], 'en', (req) =>
      req.method === 'POST'
        ? new Response(JSON.stringify({ code: 'duplicate', status: 409, existingId: existing.id }), {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          })
        : undefined,
    )
    const dialog = await openAdd('Emma')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Emma 2' } })
    await settle()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add "Emma 2" as draft' }))
    await waitFor(() => expect(screen.getByRole('dialog').textContent).toContain('Emma'))
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('editing the text after a failure uses a new id', async () => {
    const { calls } = renderList(BooksScreen, [], 'en', (req) => (req.method === 'POST' ? json500() : undefined))
    fireEvent.click(await screen.findByRole('button', { name: 'Add a book' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Emma' } })
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Add "Emma" as draft' }))
    await screen.findByRole('alert')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Emma 2' } })
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Add "Emma 2" as draft' }))
    await waitFor(() => expect(posts(calls)).toHaveLength(2))
    const [a, b] = posts(calls)
    expect(a!.body.id).not.toBe(b!.body.id)
  })

  it('400 validation on sourceUrl shows the generic error and keeps the sheet open with the row enabled', async () => {
    renderList(BooksScreen, [], 'en', (req) =>
      req.method === 'POST'
        ? new Response(
            JSON.stringify({
              code: 'validation',
              status: 400,
              errors: [{ field: 'sourceUrl', message: 'unsupported' }],
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          )
        : undefined,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Add a book' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Emma' } })
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Add "Emma" as draft' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Something went wrong')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Add "Emma" as draft' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('Close dismisses without sending anything', async () => {
    const { calls } = renderList(BooksScreen, [fake<Book>()])
    const dialog = await openAdd()
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Abc' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(posts(calls)).toHaveLength(0)
  })
})

describe('add sheet (movies)', () => {
  it('creates a draft with exactly {id, sourceUrl}: no type, no title', async () => {
    const { calls } = renderList(MoviesScreen, [fake<Movie>({ type: 'movie', title: 'Alien' })])
    const dialog = await openAdd()
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Movie or series title' }), {
      target: { value: 'Blade Runner' },
    })
    await settle()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add "Blade Runner" as draft' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const [post] = posts(calls)
    expect(post!.path).toBe('/api/v1/movies')
    expect(Object.keys(post!.body).sort()).toEqual(['id', 'sourceUrl'])
    expect(post!.body.sourceUrl).toBe('https://www.google.com/search?q=Blade%20Runner')
    expect(post!.body.id).toMatch(UUID)
    expect(await screen.findByText('Blade Runner')).toBeTruthy()
  })

  it('no draft entry when the text equals a title or an original title of any item', async () => {
    renderList(MoviesScreen, [
      fake<Movie>({ type: 'tv', title: 'Lost' }),
      fake<Movie>({ type: 'movie', title: 'Леон', originalTitle: 'Léon' }),
    ])
    const dialog = await openAdd('Lost')
    const input = within(dialog).getByRole('textbox')
    fireEvent.change(input, { target: { value: 'LOST' } })
    expect(within(dialog).queryByRole('button', { name: /as draft/ })).toBeNull()
    fireEvent.change(input, { target: { value: 'léon' } })
    expect(within(dialog).queryByRole('button', { name: /as draft/ })).toBeNull()
    expect(within(dialog).getByText('Already in your library')).toBeTruthy()
    fireEvent.change(input, { target: { value: 'Heat' } })
    expect((within(dialog).getByRole('button', { name: 'Add "Heat" as draft' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
  })
})

describe('add sheet provider search and add', () => {
  const src = (id: string, o: Partial<DataSource> = {}) =>
    ({
      id,
      label: id === 'tmdb' ? 'TMDb' : id === 'tvdb' ? 'TVDB' : 'Open Library',
      requiresKey: id === 'tmdb',
      isDefault: false,
      isEffective: false,
      available: true,
      tokenSaved: false,
      ...o,
    }) as DataSource
  const OL = 'https://openlibrary.org/works/OL45804W'
  const OL2 = 'https://openlibrary.org/works/OL2W'
  const book = (o: Record<string, unknown> = {}) => ({
    kind: 'provider',
    sourceUrl: OL,
    title: 'Dune',
    author: 'Frank Herbert',
    year: 1965,
    rating: 4.3,
    ...o,
  })
  const draftHit = (text: string) => ({ kind: 'draft', title: text.trim(), sourceUrl: draftLink(text) })
  const problem = (
    status: number,
    code: string,
    extra: Record<string, unknown> = {},
    headers: Record<string, string> = {},
  ) => json({ status, code, ...extra }, status, headers)
  const online = (v: boolean) => Object.defineProperty(navigator, 'onLine', { value: v, configurable: true })
  afterEach(() => online(true))

  interface Setup {
    kind?: 'book' | 'movie'
    items?: LibraryItem[]
    sources?: { books: DataSource[]; movies: DataSource[] } | 'fail'
    search?: (q: string, source: string | null) => Response
    details?: () => Response
    post?: (n: number, body: { id: string; sourceUrl: string }) => Response | Promise<Response>
  }
  function setup({ kind = 'book', items = [], sources, search, details, post }: Setup = {}) {
    const calls: { method: string; url: URL; body?: { id: string; sourceUrl: string } }[] = []
    let posts = 0
    const fetchFn: typeof fetch = async (input, init) => {
      const req = input instanceof Request ? input : new Request(input, init)
      const url = new URL(req.url)
      const body = req.method === 'POST' ? ((await req.clone().json()) as { id: string; sourceUrl: string }) : undefined
      calls.push({ method: req.method, url, body })
      if (url.pathname === '/api/v1/data-sources')
        return sources === 'fail'
          ? problem(500, 'x')
          : json(
              sources ?? {
                books: [src('open_library', { isEffective: true })],
                movies: [src('tmdb', { isEffective: true })],
              },
            )
      if (url.pathname.endsWith('/details')) return details ? details() : problem(500, 'x')
      if (url.pathname.startsWith('/api/v1/search/'))
        return search
          ? search(url.searchParams.get('q')!, url.searchParams.get('source'))
          : json([draftHit(url.searchParams.get('q')!)])
      if (req.method === 'POST')
        return post ? await post(++posts, body!) : json(fake({ id: body!.id, title: 'x' }), 201)
      return json({})
    }
    const api = createApiClient({ baseUrl: 'http://localhost', fetch: fetchFn, csrfToken: () => 'tok' })
    const repo = createMediaRepository(api)
    const onClose = vi.fn()
    const onDuplicate = vi.fn()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <AddSheet
          kind={kind}
          locale="en"
          items={items}
          api={api}
          create={(req, h) =>
            void (kind === 'book' ? repo.createBook(req) : repo.createMovie(req)).then(h.onSuccess, h.onError)
          }
          onClose={onClose}
          onDuplicate={onDuplicate}
        />
      </QueryClientProvider>,
    )
    const type = (v: string) => fireEvent.change(screen.getByRole('textbox'), { target: { value: v } })
    const searches = () => calls.filter((c) => c.url.pathname.startsWith('/api/v1/search/'))
    const created = () => calls.filter((c) => c.method === 'POST')
    return { calls, type, searches, created, onClose, onDuplicate }
  }
  // the preview (info) buttons are named "Details of <title>" and are not entries
  const row = async (name: RegExp | string) => {
    const button = (await screen.findByRole(
      'button',
      { name: (n) => !n.startsWith('Details of') && (typeof name === 'string' ? n === name : name.test(n)) },
      { timeout: 3000 },
    )) as HTMLButtonElement
    await settle()
    return button
  }
  const dialog = () => screen.getByRole('dialog')

  it('one available source: no selector, just the "Searching in" line', async () => {
    setup()
    expect(await screen.findByText('Searching in Open Library')).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Search source' })).toBeNull()
  })

  it('two available sources: selector, effective (not first) preselected; choosing one sends source= and never changes the default', async () => {
    const sources = { books: [src('open_library'), src('tvdb', { isEffective: true })], movies: [] }
    const { type, searches, calls } = setup({ sources })
    expect(await screen.findByText('Searching in TVDB')).toBeTruthy()
    const group = screen.getByRole('group', { name: 'Search source' })
    expect(within(group).getByRole('button', { name: 'TVDB' }).getAttribute('aria-pressed')).toBe('true')
    type('dune')
    await waitFor(() => expect(searches()).toHaveLength(1), { timeout: 2000 })
    expect(searches()[0]!.url.searchParams.has('source')).toBe(false)
    fireEvent.click(within(group).getByRole('button', { name: 'Open Library' }))
    await waitFor(() => expect(searches()).toHaveLength(2), { timeout: 2000 })
    expect(searches()[1]!.url.searchParams.get('source')).toBe('open_library')
    expect(screen.getByText('Searching in Open Library')).toBeTruthy()
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)
  })

  it('lists hits with year, rating, author and the draft entry last; a hit without data shows dashes', async () => {
    const { type } = setup({
      search: (q) =>
        json([
          book(),
          book({ sourceUrl: OL2, title: 'Sparse', author: undefined, year: undefined, rating: undefined }),
          draftHit(q),
        ]),
    })
    type('dune')
    await row(/Dune/)
    const buttons = within(dialog())
      .getAllByRole('button')
      .filter((b) => b.closest('li') && !b.getAttribute('aria-label')?.startsWith('Details of'))
    expect(buttons.map((b) => b.textContent)).toEqual([
      expect.stringContaining('Dune'),
      expect.stringContaining('Sparse'),
      'Add "dune" as draft',
    ])
    expect(buttons[0]!.textContent).toContain('1965')
    expect(buttons[0]!.textContent).toContain('Frank Herbert')
    expect(buttons[1]!.textContent).toContain('N/A')
    expect(buttons[1]!.textContent).toContain('No author')
  })

  it('shows a spinner while searching and "no matches" with only the draft entry for an empty result', async () => {
    const { type } = setup()
    await screen.findByText('Searching in Open Library')
    type('dune')
    expect(screen.getByRole('status', { name: 'Searching' })).toBeTruthy()
    await screen.findByText('No matches in Open Library.')
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add "dune" as draft' })).toBeTruthy()
  })

  it('a hit whose sourceUrl equals an item externalLink is disabled; the draft entry is hidden for a library title but provider rows stay', async () => {
    const { type } = setup({
      items: [{ id: 'i1', title: 'Dune', externalLink: OL }],
      search: (q) => json([book(), book({ sourceUrl: OL2, title: 'Dune Messiah' }), draftHit(q)]),
    })
    type('Dune ')
    const mine = await row(/^Dune(?! Messiah)/)
    expect(mine.disabled).toBe(true)
    expect(within(mine.closest('li')!).getByText('In your library')).toBeTruthy()
    expect((await row(/Dune Messiah/)).disabled).toBe(false)
    expect(screen.queryByRole('button', { name: /as draft/ })).toBeNull()
  })

  it('a movie original title equal to the text hides the draft entry', async () => {
    const { type, searches } = setup({
      kind: 'movie',
      items: [
        {
          id: 'm1',
          title: 'Parasite',
          originalTitle: 'Gisaengchung',
          externalLink: 'https://www.themoviedb.org/movie/1',
        },
      ],
    })
    type('gisaengchung')
    await waitFor(() => expect(searches()).toHaveLength(1), { timeout: 2000 })
    expect(screen.queryByRole('button', { name: /as draft/ })).toBeNull()
    expect(screen.getByText('Already in your library')).toBeTruthy()
  })

  it('ISBN: disabled for a library book with that normalized ISBN; a hit without isbn falls back to the link rule', async () => {
    const { type } = setup({
      items: [
        { id: 'i1', title: 'Stored', isbn: '978-0-441-17271-9', externalLink: 'https://openlibrary.org/works/OL1W' },
      ],
      search: (q) =>
        json([
          book({ title: 'Same ISBN', isbn: '9780441172719' }),
          book({ sourceUrl: OL2, title: 'No ISBN' }),
          draftHit(q),
        ]),
    })
    type('dune')
    expect((await row(/Same ISBN/)).disabled).toBe(true)
    expect((await row(/No ISBN/)).disabled).toBe(false)
  })

  it('failing GET /data-sources, offline and a failing search all leave the local draft entry', async () => {
    const first = setup({ sources: 'fail' })
    first.type('dune')
    expect(await row('Add "dune" as draft')).toBeTruthy()
    expect(await screen.findByText(/Search is unavailable now/)).toBeTruthy()
    expect(first.searches()).toHaveLength(0)
  })

  it('offline: no request is sent and the draft entry is offered', async () => {
    online(false)
    const { type, searches } = setup()
    type('dune')
    expect(await row('Add "dune" as draft')).toBeTruthy()
    expect(screen.getByText(/Search is unavailable now/)).toBeTruthy()
    await new Promise((r) => setTimeout(r, 700))
    expect(searches()).toHaveLength(0)
  })

  it('a failed search says so inside the sheet, naming the source, and keeps the local draft entry', async () => {
    const { type } = setup({ search: () => problem(502, 'provider_error', { source: 'open_library' }) })
    type('dune')
    const alert = await screen.findByRole('alert', {}, { timeout: 3000 })
    expect(dialog().contains(alert)).toBe(true)
    expect(alert.textContent).toContain('Open Library is unavailable. Try again in a moment.')
    expect(screen.getByRole('button', { name: 'Add "dune" as draft' })).toBeTruthy()
  })

  it.each([
    [504, 'provider_timeout', 'took too long to answer'],
    [429, 'rate_limited', 'Too many searches'],
    [503, 'provider_rate_limited', 'is busy'],
    [500, 'x', 'Search failed'],
  ])('search failure %s %s has its own wording', async (status, code, text) => {
    const { type } = setup({ search: () => problem(status, code) })
    type('dune')
    const alert = await screen.findByRole('alert', {}, { timeout: 3000 })
    expect(alert.textContent).toContain(text)
    expect(alert.textContent).not.toContain('Nothing was added')
    if (code !== 'x' && code !== 'rate_limited') expect(alert.textContent).toContain('Open Library')
  })

  it('shows one state line: offline wins over the source line', async () => {
    online(false)
    setup()
    expect(await screen.findByText(/Search is unavailable now/)).toBeTruthy()
    expect(screen.queryByText(/Searching in/)).toBeNull()
  })

  it('a key problem names the source and shows only that line (no "Searching in")', async () => {
    const { type } = setup({ kind: 'movie', search: () => problem(409, 'source_key_invalid', { source: 'tmdb' }) })
    type('dune')
    expect(await screen.findByText(/Your TMDb key was rejected/, {}, { timeout: 3000 })).toBeTruthy()
    expect(screen.queryByText(/Searching in/)).toBeNull()
  })

  it('typing within the debounce never offers the previous query hits or server draft', async () => {
    const { type, created } = setup({ search: (q) => json([book(), draftHit(q)]) })
    type('dune')
    await row('Add "dune" as draft')
    await screen.findByText('Frank Herbert')
    type('dunes')
    expect(screen.queryByText('Frank Herbert')).toBeNull()
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Add "dunes" as draft' }))
    await waitFor(() => expect(created()).toHaveLength(1))
    expect(created()[0]!.body!.sourceUrl).toBe(draftLink('dunes'))
  })

  it('no available source: names it, links to Settings (closes the sheet and switches the tab hash); the draft stays', async () => {
    const sources = { books: [], movies: [src('tmdb', { isEffective: true, isDefault: true, available: false })] }
    const { type, searches, onClose } = setup({ kind: 'movie', sources })
    type('dune')
    expect(await screen.findByText(/Add your TMDb key in Settings/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add "dune" as draft' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }))
    expect(window.location.hash).toBe('#/settings')
    expect(onClose).toHaveBeenCalled()
    expect(searches()).toHaveLength(0)
  })

  it('a search that answers source_key_missing explains it instead of a toast', async () => {
    const { type } = setup({ kind: 'movie', search: () => problem(409, 'source_key_missing', { source: 'tmdb' }) })
    type('dune')
    expect(await screen.findByText(/Add your TMDb key in Settings/, {}, { timeout: 3000 })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  describe('add from an entry', () => {
    const movieHits = (q: string) => [
      { kind: 'provider', type: 'movie', sourceUrl: 'https://www.themoviedb.org/movie/1396', title: 'Movie 1396' },
      { kind: 'provider', type: 'tv', sourceUrl: 'https://www.themoviedb.org/tv/1396', title: 'Series 1396' },
      draftHit(q),
    ]

    it.each([
      ['book', undefined, /^Dune/, OL],
      ['movie', movieHits, /^Movie 1396/, 'https://www.themoviedb.org/movie/1396'],
      ['movie', movieHits, /^Series 1396/, 'https://www.themoviedb.org/tv/1396'],
      ['book', undefined, /as draft/, draftLink('dune')],
    ] as const)(
      '%s entry: posts exactly {id, sourceUrl}, no details request, closes on 201',
      async (kind, hits, name, url) => {
        const { type, created, calls, onClose } = setup({
          kind,
          search: (q) => json(hits ? hits(q) : [book(), draftHit(q)]),
        })
        type('dune')
        fireEvent.click(await row(name))
        await waitFor(() => expect(onClose).toHaveBeenCalled())
        expect(created()).toHaveLength(1)
        expect(Object.keys(created()[0]!.body!).sort()).toEqual(['id', 'sourceUrl'])
        expect(created()[0]!.body!.id).toMatch(UUID)
        expect(created()[0]!.body!.sourceUrl).toBe(url)
        expect(calls.some((c) => c.url.pathname.endsWith('/details'))).toBe(false)
      },
    )

    it('ignores row taps for 300 ms after the list changed, then adds', async () => {
      const { type, created } = setup({ search: (q) => json([book(), draftHit(q)]) })
      type('dune')
      const dune = (await screen.findByRole('button', { name: /^Dune/ }, { timeout: 3000 })) as HTMLButtonElement
      fireEvent.click(dune)
      expect(created()).toHaveLength(0)
      expect(dune.disabled).toBe(false)
      await settle()
      fireEvent.click(dune)
      await waitFor(() => expect(created()).toHaveLength(1))
    })

    it('while an add is pending the text field and the info buttons are disabled too', async () => {
      const { type } = setup({
        search: (q) => json([book(), draftHit(q)]),
        post: () => new Promise<Response>(() => {}),
      })
      type('dune')
      fireEvent.click(await row(/^Dune/))
      await waitFor(() => expect((screen.getByRole('textbox') as HTMLInputElement).disabled).toBe(true))
      expect((screen.getByRole('button', { name: 'Details of Dune' }) as HTMLButtonElement).disabled).toBe(true)
    })

    it('the pending row shows a spinner and blocks a second tap until the server answers', async () => {
      const { type, created } = setup({
        search: (q) => json([book(), draftHit(q)]),
        post: () => new Promise<Response>(() => {}),
      })
      type('dune')
      const dune = await row(/^Dune/)
      fireEvent.click(dune)
      fireEvent.click(dune)
      fireEvent.click(screen.getByRole('button', { name: /as draft/ }))
      await waitFor(() => expect(created()).toHaveLength(1))
      expect(dune.querySelector('.animate-spin')).toBeTruthy()
      expect(dune.disabled).toBe(true)
      expect((screen.getByRole('button', { name: /as draft/ }) as HTMLButtonElement).disabled).toBe(true)
    })

    it('504 keeps the sheet open with a Retry toast; Retry re-sends the same id and a 200 closes the sheet', async () => {
      const { type, created, onClose } = setup({
        search: (q) => json([book(), draftHit(q)]),
        post: (n, body) => (n === 1 ? problem(504, 'provider_timeout') : json(fake({ id: body.id }), 200)),
      })
      type('dune')
      fireEvent.click(await row(/^Dune/))
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('took too long')
      expect(onClose).not.toHaveBeenCalled()
      expect((screen.getByRole('button', { name: /^Dune/ }) as HTMLButtonElement).disabled).toBe(false)
      fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
      await waitFor(() => expect(onClose).toHaveBeenCalled())
      expect(created()).toHaveLength(2)
      expect(created()[1]!.body!.id).toBe(created()[0]!.body!.id)
    })

    it('another entry after a failure gets a new id', async () => {
      const { type, created } = setup({
        search: (q) => json([book(), book({ sourceUrl: OL2, title: 'Other' }), draftHit(q)]),
        post: () => problem(502, 'provider_error'),
      })
      type('dune')
      fireEvent.click(await row(/^Dune/))
      await screen.findByRole('alert')
      fireEvent.click(screen.getByRole('button', { name: /^Other/ }))
      await waitFor(() => expect(created()).toHaveLength(2))
      expect(created()[1]!.body!.id).not.toBe(created()[0]!.body!.id)
    })

    it('429 with Retry-After counts down in the notice (no Retry), the row looks normal and ignores taps until it is over', async () => {
      const { type, created } = setup({
        search: (q) => json([book(), draftHit(q)]),
        post: (n, body) =>
          n === 1 ? problem(429, 'rate_limited', {}, { 'Retry-After': '1' }) : json(fake({ id: body.id }), 201),
      })
      type('dune')
      fireEvent.click(await row(/^Dune/))
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('Try again in 1 s')
      expect(within(alert).queryByRole('button', { name: 'Retry' })).toBeNull()
      const dune = screen.getByRole('button', { name: /^Dune/ }) as HTMLButtonElement
      expect(dune.disabled).toBe(false)
      expect(dune.getAttribute('aria-disabled')).toBe('true')
      fireEvent.click(dune)
      expect(created()).toHaveLength(1)
      await waitFor(
        () => expect(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' })).toBeTruthy(),
        { timeout: 2500 },
      )
      expect(screen.getByRole('alert').textContent).not.toContain('Try again in')
      expect(dune.hasAttribute('aria-disabled')).toBe(false)
      expect(created()).toHaveLength(1)
    })

    it('409 duplicate adopts existingId', async () => {
      const { type, onDuplicate } = setup({
        search: (q) => json([book(), draftHit(q)]),
        post: () => problem(409, 'duplicate', { existingId: 'abc' }),
      })
      type('dune')
      fireEvent.click(await row(/^Dune/))
      await waitFor(() => expect(onDuplicate).toHaveBeenCalledWith('abc'))
    })

    it('409 source_key_missing names the source and offers Open Settings', async () => {
      const { type, onClose } = setup({
        kind: 'movie',
        search: (q) => json([...movieHits(q)]),
        post: () => problem(409, 'source_key_missing', { source: 'tmdb' }),
      })
      type('dune')
      fireEvent.click(await row(/^Movie 1396/))
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('TMDb')
      expect(dialog().contains(alert)).toBe(true)
      fireEvent.click(within(alert).getByRole('button', { name: 'Open Settings' }))
      expect(window.location.hash).toBe('#/settings')
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('422 source_not_found removes the entry', async () => {
      const { type } = setup({
        search: (q) => json([book(), draftHit(q)]),
        post: () => problem(422, 'source_not_found'),
      })
      type('dune')
      fireEvent.click(await row(/^Dune/))
      expect((await screen.findByRole('alert')).textContent).toContain('Not found at the source')
      expect(screen.queryByRole('button', { name: /^Dune/ })).toBeNull()
      expect(screen.getByRole('button', { name: /as draft/ })).toBeTruthy()
    })

    it('400 validation on sourceUrl shows the generic message without Retry', async () => {
      const { type } = setup({
        search: (q) => json([book(), draftHit(q)]),
        post: () => problem(400, 'validation', { errors: [{ field: 'sourceUrl', message: 'x' }] }),
      })
      type('dune')
      fireEvent.click(await row(/^Dune/))
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('Something went wrong')
      expect(within(alert).queryByRole('button', { name: 'Retry' })).toBeNull()
    })
  })
  describe('preview', () => {
    const details = {
      title: 'Dune (server)',
      author: 'Frank Herbert',
      description: 'Spice and sand.',
      year: 1965,
      rating: 4.3,
      externalLink: OL,
    }
    const info = () => screen.findByRole('button', { name: 'Details of Dune' })

    it('shows the server values; Add sends only {id, sourceUrl} and closes', async () => {
      const { type, created, calls, onClose } = setup({
        search: (q) => json([book(), draftHit(q)]),
        details: () => json(details),
      })
      type('dune')
      fireEvent.click(await info())
      const preview = (await screen.findAllByRole('dialog')).at(-1)!
      expect(await within(preview).findByText('Spice and sand.')).toBeTruthy()
      expect(within(preview).getByText('Dune (server)')).toBeTruthy()
      expect(within(preview).getByText('Frank Herbert')).toBeTruthy()
      const detailsCall = calls.find((c) => c.url.pathname === '/api/v1/search/books/details')!
      expect(detailsCall.url.searchParams.get('sourceUrl')).toBe(OL)
      fireEvent.click(within(preview).getByRole('button', { name: 'Add' }))
      await waitFor(() => expect(onClose).toHaveBeenCalled())
      expect(created()).toHaveLength(1)
      expect(Object.keys(created()[0]!.body!).sort()).toEqual(['id', 'sourceUrl'])
      expect(created()[0]!.body!.sourceUrl).toBe(OL)
    })

    it('while the preview is open the add sheet beneath is inert and aria-hidden; closing restores it', async () => {
      setup({ search: (q) => json([book(), draftHit(q)]), details: () => json(details) })
      screen.getByRole('textbox')
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'dune' } })
      const add = screen.getByRole('dialog')
      fireEvent.click(await info())
      const preview = (await screen.findAllByRole('dialog')).at(-1)!
      const addRoot = add.parentElement!
      expect(addRoot.hasAttribute('inert')).toBe(true)
      expect(addRoot.getAttribute('aria-hidden')).toBe('true')
      expect(screen.getAllByRole('dialog')).toEqual([preview])
      fireEvent.click(within(preview).getByRole('button', { name: 'Close' }))
      expect(addRoot.hasAttribute('inert')).toBe(false)
      expect(addRoot.hasAttribute('aria-hidden')).toBe(false)
    })

    it('a failing preview shows an inline error and leaves both Add and the row working; the draft entry has no info control', async () => {
      const { type, created } = setup({
        search: (q) => json([book(), draftHit(q)]),
        details: () => problem(502, 'provider_error'),
      })
      type('dune')
      expect(screen.queryAllByRole('button', { name: /^Details of/ })).toHaveLength(0)
      fireEvent.click(await info())
      const preview = (await screen.findAllByRole('dialog')).at(-1)!
      expect((await within(preview).findByRole('alert')).textContent).toContain('Details are not available')
      fireEvent.click(within(preview).getByRole('button', { name: 'Close' }))
      expect(screen.getAllByRole('dialog')).toHaveLength(1)
      fireEvent.click(await row(/^Dune/))
      await waitFor(() => expect(created()).toHaveLength(1))
      expect(screen.getAllByRole('button', { name: /^Details of/ })).toHaveLength(1)
    })
  })
})
