import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiClient } from '../../api/client'
import type { DataSource } from '../settings/useDataSources'
import { useSearchBooks, useSearchMovies } from './providerSearch'
import { json } from '../../test/fixtures'

const src = (id: string, isEffective: boolean) =>
  ({
    id,
    label: id,
    requiresKey: false,
    isDefault: isEffective,
    isEffective,
    available: true,
    tokenSaved: false,
  }) as DataSource
const defaultSources = { books: [src('open_library', true)], movies: [src('tmdb', true)] }
const draft = (text: string) => ({ kind: 'draft', title: text, sourceUrl: `https://www.google.com/search?q=${text}` })

function setup(sources = defaultSources) {
  const searches: Request[] = []
  const aborted: string[] = []
  const fetchFn: typeof fetch = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init)
    const url = new URL(req.url)
    if (url.pathname === '/api/v1/data-sources') return json(sources)
    searches.push(req)
    const q = url.searchParams.get('q') ?? ''
    if (q === 'fail') return json({ title: 'x', status: 409, code: 'source_key_missing', source: 'tmdb' }, 409)
    return new Promise<Response>((resolve, reject) => {
      req.signal.addEventListener('abort', () => {
        aborted.push(q)
        reject(new DOMException('aborted', 'AbortError'))
      })
      if (q !== 'slow') resolve(json([draft(q)]))
    })
  }
  const api = createApiClient({ baseUrl: 'http://localhost', fetch: fetchFn })
  const qc = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return { api, searches, aborted, wrapper }
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('provider search hooks', () => {
  it('sends nothing for fewer than 3 trimmed characters or more than 200', async () => {
    const { api, searches, wrapper } = setup()
    const { rerender } = renderHook(({ q }) => useSearchBooks(q, 'open_library', api), {
      wrapper,
      initialProps: { q: ' ab ' },
    })
    await advance(1000)
    rerender({ q: 'x'.repeat(201) })
    await advance(1000)
    expect(searches).toHaveLength(0)
  })

  it('debounces by 0.5 s and sends the trimmed text', async () => {
    const { api, searches, wrapper } = setup()
    const { result, rerender } = renderHook(({ q }) => useSearchBooks(q, 'open_library', api), {
      wrapper,
      initialProps: { q: '' },
    })
    rerender({ q: 'dun' })
    await advance(300)
    rerender({ q: ' dune ' })
    await advance(499)
    expect(searches).toHaveLength(0)
    await advance(1)
    await advance(0)
    expect(searches.map((r) => new URL(r.url).searchParams.get('q'))).toEqual(['dune'])
    expect(result.current.data).toEqual([draft('dune')])
  })

  it('omits source for the effective source and sends it otherwise', async () => {
    const effective = setup()
    renderHook(() => useSearchBooks('emma', 'open_library', effective.api), { wrapper: effective.wrapper })
    await advance(1000)
    expect(effective.searches).toHaveLength(1)
    expect(new URL(effective.searches[0]!.url).searchParams.has('source')).toBe(false)

    const chosen = setup({ books: [], movies: [src('tmdb', false)] })
    renderHook(() => useSearchMovies('alien', 'tmdb', chosen.api), { wrapper: chosen.wrapper })
    await advance(1000)
    expect(new URL(chosen.searches[0]!.url).pathname).toBe('/api/v1/search/movies')
    expect(new URL(chosen.searches[0]!.url).searchParams.get('source')).toBe('tmdb')
  })

  it('aborts a superseded request silently and the newest query wins', async () => {
    const { api, searches, aborted, wrapper } = setup()
    const { result, rerender } = renderHook(({ q }) => useSearchBooks(q, 'open_library', api), {
      wrapper,
      initialProps: { q: 'slow' },
    })
    await advance(1000)
    expect(searches).toHaveLength(1)
    rerender({ q: 'fast' })
    await advance(1000)
    await advance(0)
    expect(aborted).toEqual(['slow'])
    expect(result.current.data).toEqual([draft('fast')])
    expect(result.current.error).toBeNull()
  })

  it('maps a failure to a ApiError', async () => {
    const { api, wrapper } = setup()
    const { result } = renderHook(() => useSearchBooks('fail', 'open_library', api), { wrapper })
    await advance(1000)
    expect(result.current.error).toMatchObject({ kind: 'source_key_missing', source: 'tmdb' })
  })
})
