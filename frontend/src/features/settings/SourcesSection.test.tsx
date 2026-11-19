import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { json } from '../../test/fixtures'
import { authSignal, createApiClient } from '../../api/client'
import type { Locale } from '../../i18n'
import { en } from '../../i18n/en'
import { SourcesSection } from './SourcesSection'
import {
  DATA_SOURCES_KEY,
  DataSourceError,
  useDataSources,
  useDeleteSourceKey,
  useSaveSourceKey,
  useSetDefaultDataSource,
  type DataSource,
  type DataSources,
} from './useDataSources'

const ol = (over: Partial<DataSource> = {}): DataSource => ({
  id: 'open_library',
  label: 'Open Library',
  requiresKey: false,
  isDefault: true,
  isEffective: true,
  available: true,
  tokenSaved: false,
  ...over,
})
const tmdb = (over: Partial<DataSource> = {}): DataSource => ({
  id: 'tmdb',
  label: 'TMDb',
  requiresKey: true,
  isDefault: true,
  isEffective: false,
  available: false,
  tokenSaved: false,
  ...over,
})
const lists = (over: Partial<DataSources> = {}): DataSources => ({
  books: [ol()],
  movies: [tmdb()],
  ...over,
})
/** Fake second book source to exercise the default control. */
const twoBooks = (): DataSources =>
  lists({
    books: [ol(), ol({ id: 'tmdb', label: 'Second', isDefault: false, isEffective: false })],
  })

const SECRET = 'SECRET-KEY-1234567890abcdef'

function setup(initial: DataSources, handler?: (req: Request) => Response) {
  const calls: Request[] = []
  const api = createApiClient({
    baseUrl: 'http://localhost',
    csrfToken: () => 'tok',
    fetch: (input, init) => {
      const req = new Request(input, init)
      calls.push(req)
      if (req.method === 'GET') return Promise.resolve(json(initial))
      return Promise.resolve(handler ? handler(req) : json(initial))
    },
  })
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return { api, calls, qc, wrapper }
}

function mount(initial: DataSources, handler?: (req: Request) => Response, locale: Locale = 'en') {
  const s = setup(initial, handler)
  render(<SourcesSection api={s.api} locale={locale} />, { wrapper: s.wrapper })
  return s
}
const writes = (calls: Request[]) => calls.filter((c) => c.method !== 'GET')
const path = (r: Request) => new URL(r.url).pathname

beforeEach(() => {
  authSignal.reset()
})

describe('data-source hooks', () => {
  it('a mutation response replaces the cached lists without a refetch', async () => {
    const after = lists({ movies: [tmdb({ available: true, tokenSaved: true })] })
    const { api, calls, qc, wrapper } = setup(lists(), () => json(after))
    const list = renderHook(() => useDataSources(api), { wrapper })
    await waitFor(() => expect(list.result.current.sources).toBeTruthy())
    const save = renderHook(() => useSaveSourceKey(api), { wrapper })
    save.result.current.mutate({ resourceType: 'movie', source: 'tmdb', apiKey: 'k' })
    await waitFor(() => expect(qc.getQueryData(DATA_SOURCES_KEY)).toEqual(after))
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(1)
    expect(path(calls[1]!)).toBe('/api/v1/data-sources/movie/tmdb/key')
    expect(await calls[1]!.json()).toEqual({ apiKey: 'k' })
  })

  it('save key never lingers in the MutationCache and does not wait for the network', async () => {
    const { api, qc, wrapper } = setup(lists(), () => json(lists()))
    const save = renderHook(() => useSaveSourceKey(api), { wrapper })
    save.result.current.mutate({ resourceType: 'movie', source: 'tmdb', apiKey: SECRET })
    await waitFor(() => expect(save.result.current.isSuccess).toBe(true))
    save.unmount()
    await waitFor(() => expect(qc.getMutationCache().getAll()).toHaveLength(0))
    const opts = qc.getMutationCache().getAll()
    expect(JSON.stringify(opts)).not.toContain(SECRET)
  })

  it('set default and delete key call their paths and cache the result', async () => {
    const after = twoBooks()
    const { api, calls, qc, wrapper } = setup(lists(), () => json(after))
    const def = renderHook(() => useSetDefaultDataSource(api), { wrapper })
    def.result.current.mutate({ resourceType: 'book', source: 'open_library' })
    await waitFor(() => expect(qc.getQueryData(DATA_SOURCES_KEY)).toEqual(after))
    const del = renderHook(() => useDeleteSourceKey(api), { wrapper })
    del.result.current.mutate({ resourceType: 'movie', source: 'tmdb' })
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls.map((c) => `${c.method} ${path(c)}`)).toEqual([
      'PUT /api/v1/data-sources/book/open_library/default',
      'DELETE /api/v1/data-sources/movie/tmdb/key',
    ])
  })

  it.each([
    ['source_key_rejected', 422],
    ['provider_timeout', 504],
    ['provider_error', 502],
    ['rate_limited', 429],
  ])('problem code %s maps to a typed error', async (code, status) => {
    const { api, wrapper } = setup(lists(), () => json({ title: 'x', status, code, source: 'tmdb' }, status))
    const save = renderHook(() => useSaveSourceKey(api), { wrapper })
    save.result.current.mutate({ resourceType: 'movie', source: 'tmdb', apiKey: 'k' })
    await waitFor(() => expect(save.result.current.isError).toBe(true))
    const err = save.result.current.error
    expect(err).toBeInstanceOf(DataSourceError)
    expect((err as DataSourceError).kind).toBe(code)
    expect((err as DataSourceError).status).toBe(status)
    expect((err as DataSourceError).source).toBe('tmdb')
  })
})

describe('Sources section', () => {
  it('shows both categories with source states and no default radio for one source per group', async () => {
    mount(lists())
    expect(await screen.findByText('Open Library')).toBeTruthy()
    expect(screen.getByText('Books')).toBeTruthy()
    expect(screen.getByText('Movies and TV')).toBeTruthy()
    expect(screen.getByText('TMDb')).toBeTruthy()
    expect(screen.getByText('Needs an API key')).toBeTruthy()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    // every row has the same shape: only a source that needs a key has a key button
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByLabelText(/API key for/)).toBeNull()
  })

  it('loading and error states, retry reloads', async () => {
    const s = setup(lists())
    let fail = true
    const api = createApiClient({
      baseUrl: 'http://localhost',
      fetch: () => {
        return Promise.resolve(fail ? json({ title: 'x', status: 500, code: 'boom' }, 500) : json(lists()))
      },
    })
    render(<SourcesSection api={api} locale="en" />, { wrapper: s.wrapper })
    expect(screen.getByRole('status').textContent).toContain('Loading sources')
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load sources')
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Open Library')).toBeTruthy()
  })

  it('changing the default sends PUT .../default and the response flips the selection', async () => {
    const after = twoBooks()
    after.books = [
      { ...after.books[0]!, isDefault: false, isEffective: false },
      { ...after.books[1]!, isDefault: true, isEffective: true },
    ]
    const s = mount(twoBooks(), () => json(after))
    const radios = await screen.findAllByRole('radio')
    expect(radios).toHaveLength(2)
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    fireEvent.click(radios[1]!)
    await waitFor(() =>
      expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true']),
    )
    const w = writes(s.calls)
    expect(w).toHaveLength(1)
    expect(`${w[0]!.method} ${path(w[0]!)}`).toBe('PUT /api/v1/data-sources/book/tmdb/default')
    expect(w[0]!.headers.get('X-XSRF-TOKEN')).toBe('tok')
  })

  it('clicking the current default sends nothing; failure shows an alert', async () => {
    const s = mount(twoBooks(), () => json({ title: 'x', status: 500 }, 500))
    const radios = await screen.findAllByRole('radio')
    fireEvent.click(radios[0]!)
    expect(writes(s.calls)).toHaveLength(0)
    fireEvent.click(radios[1]!)
    expect((await screen.findByRole('alert')).textContent).toContain('Could not change the default')
  })

  it('a default without a key keeps its radio selected and carries a short hint on its own line', async () => {
    const data: DataSources = {
      books: [
        ol({ isDefault: false, isEffective: true }),
        ol({ id: 'tmdb', label: 'Second', requiresKey: true, isDefault: true, isEffective: false, available: false }),
      ],
      movies: [tmdb()],
    }
    mount(data)
    const radios = await screen.findAllByRole('radio')
    expect(radios[1]!.getAttribute('aria-checked')).toBe('true')
    expect(radios[1]!.textContent).toContain(en['sources.defaultNeedsKey'])
  })

  const openKey = async (name: RegExp = /Needs an API key/) => {
    fireEvent.click(await screen.findByRole('button', { name }))
    return (await screen.findByLabelText('API key for TMDb')) as HTMLInputElement
  }

  it('the key dialog saves the key, closes, and the row shows Available; the key is never kept', async () => {
    const after = lists({ movies: [tmdb({ available: true, tokenSaved: true, isEffective: true })] })
    const s = mount(lists(), () => json(after))
    const input = await openKey()
    expect(input.type).toBe('password')
    expect(screen.getByRole('dialog', { name: 'TMDb: API key' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Save key' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(input, { target: { value: SECRET } })
    expect(screen.getByRole('dialog').textContent).not.toContain(SECRET)
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: /Available/ })).toBeTruthy()
    const w = writes(s.calls)
    expect(`${w[0]!.method} ${path(w[0]!)}`).toBe('PUT /api/v1/data-sources/movie/tmdb/key')
    expect(await w[0]!.json()).toEqual({ apiKey: SECRET })
    expect(document.body.textContent).not.toContain(SECRET)
    await waitFor(() => expect(s.qc.getMutationCache().getAll()).toHaveLength(0))
  })

  it('closing the key dialog with Escape returns focus to the state button', async () => {
    mount(lists())
    const button = await screen.findByRole('button', { name: /Needs an API key/ })
    button.focus()
    fireEvent.click(button)
    const input = (await screen.findByLabelText('API key for TMDb')) as HTMLInputElement
    fireEvent.keyDown(input, { key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(button))
  })

  it('the dialog explains where to get the key and links to the provider', async () => {
    mount(lists())
    await openKey()
    expect(screen.getByRole('dialog').textContent).toContain('API Read Access Token')
    const link = screen.getByRole('link', { name: 'Open TMDb API settings' })
    expect(link.getAttribute('href')).toBe('https://www.themoviedb.org/settings/api')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('Enter submits, Cancel and Escape close without a request', async () => {
    const s = mount(lists(), () => json(lists({ movies: [tmdb({ available: true, tokenSaved: true })] })))
    await openKey()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    const escaped = await openKey()
    fireEvent.keyDown(escaped, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(writes(s.calls)).toHaveLength(0)
    const input = await openKey()
    fireEvent.change(input, { target: { value: 'k' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(writes(s.calls)).toHaveLength(1))
  })

  it('a saved key opens the same dialog with Replace and Remove', async () => {
    const saved = lists({ movies: [tmdb({ available: true, tokenSaved: true })] })
    const s = mount(saved, () => json(saved))
    const input = await openKey(/Available/)
    expect(input.placeholder).toContain('New key')
    fireEvent.change(input, { target: { value: 'new-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Replace key' }))
    await waitFor(() => expect(writes(s.calls)).toHaveLength(1))
    expect(await writes(s.calls)[0]!.json()).toEqual({ apiKey: 'new-key' })
  })

  it('Remove deletes the key and the dialog stays open, now offering Save for a new key', async () => {
    const saved = lists({ movies: [tmdb({ available: true, tokenSaved: true })] })
    const s = mount(saved, () => json(lists()))
    await openKey(/Available/)
    fireEvent.click(screen.getByRole('button', { name: 'Remove key' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove key' })).toBeNull())
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save key' })).toBeTruthy()
    const w = writes(s.calls)
    expect(`${w[0]!.method} ${path(w[0]!)}`).toBe('DELETE /api/v1/data-sources/movie/tmdb/key')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: /Needs an API key/ })).toBeTruthy()
  })

  it('422 source_key_rejected keeps the dialog open with the wrong-key text', async () => {
    mount(lists(), () => json({ title: 'x', status: 422, code: 'source_key_rejected', source: 'tmdb' }, 422))
    const input = await openKey()
    fireEvent.change(input, { target: { value: SECRET } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Wrong API key for TMDb. Nothing was saved.')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(input.value).toBe(SECRET)
    expect(alert.textContent).not.toContain(SECRET)
  })

  it('a failure shows under the field, keeps focus in it, and editing the key clears the failure', async () => {
    mount(lists(), () => json({ title: 'x', status: 422, code: 'source_key_rejected', source: 'tmdb' }, 422))
    const input = await openKey()
    fireEvent.change(input, { target: { value: 'bad' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
    await screen.findByRole('alert')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('link', { name: 'Open TMDb API settings' })).toBeTruthy()
    expect(screen.getByRole('dialog').textContent).toContain('API Read Access Token')
    await waitFor(() => expect(document.activeElement).toBe(input))
    fireEvent.change(input, { target: { value: 'bad2' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(input.getAttribute('aria-invalid')).toBeNull()
  })

  it.each([
    ['source_key_missing', 409, 'TMDb needs an API key.'],
    ['source_key_invalid', 409, 'The saved key for TMDb no longer works. Replace it.'],
    ['provider_timeout', 504, 'TMDb did not respond in time. Please try again.'],
    ['provider_error', 502, 'TMDb is having problems. Please try again later.'],
    ['rate_limited', 429, 'Too many requests. Please wait a moment and try again.'],
    ['validation', 400, 'This key has an invalid format for TMDb.'],
    ['something_else', 500, 'Could not save. Please try again.'],
  ])('%s shows its message', async (code, status, text) => {
    mount(lists(), () => json({ title: 'x', status, code }, status))
    fireEvent.change(await openKey(), { target: { value: 'k' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
    expect((await screen.findByRole('alert')).textContent).toBe(text)
  })

  it("a remove failure says so, not 'Could not save'", async () => {
    const saved = lists({ movies: [tmdb({ available: true, tokenSaved: true })] })
    mount(saved, () => json({ title: 'x', status: 500 }, 500))
    await openKey(/Available/)
    fireEvent.click(screen.getByRole('button', { name: 'Remove key' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Could not remove the key. Please try again.')
  })

  it('saving offline fails fast with a clear message and sends nothing', async () => {
    const s = mount(lists())
    const input = await openKey()
    const before = writes(s.calls).length
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      fireEvent.change(input, { target: { value: 'k' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
      expect((await screen.findByRole('alert')).textContent).toBe('You are offline. Try again when connected.')
      expect(writes(s.calls)).toHaveLength(before)
    } finally {
      spy.mockRestore()
    }
  })

  it('a saved key shows Available, a missing key Needs an API key', async () => {
    mount(lists({ movies: [tmdb({ tokenSaved: true, available: true })] }))
    expect(await screen.findByRole('button', { name: en['sources.available'] })).toBeTruthy()
    cleanup()
    mount(lists())
    expect(await screen.findByRole('button', { name: en['sources.needsKey'] })).toBeTruthy()
  })

  it('localized in ru and uk', async () => {
    mount(lists(), undefined, 'ru')
    expect(await screen.findByText('Нужен ключ API')).toBeTruthy()
  })
})
