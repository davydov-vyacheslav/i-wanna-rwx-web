import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { createApiClient } from '../../api/client'
import { isMediaError, MediaError } from './errors'
import {
  BOOKS_KEY,
  MOVIES_KEY,
  useBooks,
  useCreateBook,
  useCreateMovie,
  useDeleteBook,
  useDeleteMovie,
  useMovies,
  useUpdateBook,
  useUpdateMovie,
} from './hooks'
import { draftLink } from './sourceUrl'
import type { Book, Movie } from './types'
import { json } from '../../test/fixtures'

const ID1 = '00000000-0000-0000-0000-000000000001'
const ID2 = '00000000-0000-0000-0000-000000000002'
const base = {
  userId: 'u',
  status: 'planned',
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
} as const
const stored = { source: 'draft', externalId: 'x', externalLink: draftLink('x') } as const
const link = (text: string) => draftLink(text)!
const book = (o: Partial<Book> = {}): Book =>
  ({ id: ID1, title: 'Dune', ...base, ...stored, isFavorite: false, ...o }) as Book
const movie = (o: Partial<Movie> = {}): Movie =>
  ({ id: ID1, title: 'Alien', type: 'movie', ...base, ...stored, ...o }) as Movie

function setup(handler: (req: Request) => Response | Promise<Response>) {
  const calls: Request[] = []
  const fetchFn: typeof fetch = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init)
    calls.push(req)
    return handler(req)
  }
  const api = createApiClient({ baseUrl: 'http://localhost', fetch: fetchFn, csrfToken: () => 'tok' })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return { api, calls, qc, wrapper }
}

/** Runs a mutation inside act and returns the error it rejected with (or undefined). */
async function failure(fn: () => Promise<unknown>): Promise<unknown> {
  let caught: unknown
  await act(async () => {
    try {
      await fn()
    } catch (e) {
      caught = e
    }
  })
  return caught
}

describe('list hooks', () => {
  it('refetch replaces the cached data', async () => {
    let items = [book()]
    const { api, qc, wrapper } = setup(() => json(items))
    const { result } = renderHook(() => useBooks(api), { wrapper })
    await waitFor(() => expect(result.current.data).toHaveLength(1))
    items = [book({ id: ID2, title: 'Emma' })]
    await act(async () => {
      await result.current.refetch()
    })
    expect(qc.getQueryData<Book[]>(BOOKS_KEY)?.map((b) => b.title)).toEqual(['Emma'])
  })

  it('refetches on mount even when cached data is fresh', async () => {
    let n = 0
    const { api, qc, wrapper } = setup(() => json([book({ title: `v${++n}` })]))
    qc.setQueryDefaults(BOOKS_KEY, { staleTime: 60_000 })
    const first = renderHook(() => useBooks(api), { wrapper })
    await waitFor(() => expect(first.result.current.data?.[0]?.title).toBe('v1'))
    first.unmount()
    const second = renderHook(() => useBooks(api), { wrapper })
    await waitFor(() => expect(second.result.current.data?.[0]?.title).toBe('v2'))
  })

  it('movies list loads', async () => {
    const { api, wrapper } = setup(() => json([movie()]))
    const { result } = renderHook(() => useMovies(api), { wrapper })
    await waitFor(() => expect(result.current.data?.[0]?.title).toBe('Alien'))
  })

  it('a failed list keeps the previous data and exposes a typed error', async () => {
    let fail = false
    const { api, wrapper } = setup(() => (fail ? Promise.reject(new TypeError('Failed to fetch')) : json([book()])))
    // read every field the test asserts on inside the hook: TanStack only re-renders for accessed props
    const { result } = renderHook(
      () => {
        const { data, error, refetch } = useBooks(api)
        return { data, error, refetch }
      },
      { wrapper },
    )
    await waitFor(() => expect(result.current.data).toHaveLength(1))
    fail = true
    await act(async () => {
      await result.current.refetch()
    })
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.data).toHaveLength(1)
    expect((result.current.error as MediaError).kind).toBe('network')
  })
})

describe('book mutations', () => {
  it('create adds to the cache, sends CSRF; re-POST (200) replaces rather than duplicates', async () => {
    let status = 201
    const { api, qc, calls, wrapper } = setup((req) => (req.method === 'GET' ? json([]) : json(book(), status)))
    const list = renderHook(() => useBooks(api), { wrapper })
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true))
    const { result } = renderHook(() => useCreateBook(api), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: ID1, sourceUrl: link('Dune') })
    })
    status = 200
    await act(async () => {
      await result.current.mutateAsync({ id: ID1, sourceUrl: link('Dune') })
    })
    expect(qc.getQueryData<Book[]>(BOOKS_KEY)).toHaveLength(1)
    const post = calls.find((c) => c.method === 'POST')
    expect(post?.headers.get('X-XSRF-TOKEN')).toBe('tok')
    expect(await post?.json()).toEqual({ id: ID1, sourceUrl: link('Dune') })
  })

  it('patch replaces the item in the cache', async () => {
    const { api, qc, calls, wrapper } = setup((req) =>
      req.method === 'GET'
        ? json([book(), book({ id: ID2, title: 'Emma' })])
        : json(book({ status: 'seen', version: 2 })),
    )
    const list = renderHook(() => useBooks(api), { wrapper })
    await waitFor(() => expect(list.result.current.data).toHaveLength(2))
    const { result } = renderHook(() => useUpdateBook(api), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: ID1, patch: { status: 'seen' } })
    })
    const cached = qc.getQueryData<Book[]>(BOOKS_KEY)
    expect(cached?.find((b) => b.id === ID1)).toMatchObject({ status: 'seen', version: 2 })
    expect(cached).toHaveLength(2)
    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch?.url).toBe(`http://localhost/api/v1/books/${ID1}`)
    expect(patch?.headers.get('X-XSRF-TOKEN')).toBe('tok')
  })

  it('delete removes the item from the cache', async () => {
    const { api, qc, wrapper } = setup((req) =>
      req.method === 'GET' ? json([book(), book({ id: ID2 })]) : new Response(null, { status: 204 }),
    )
    const list = renderHook(() => useBooks(api), { wrapper })
    await waitFor(() => expect(list.result.current.data).toHaveLength(2))
    const { result } = renderHook(() => useDeleteBook(api), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(ID1)
    })
    expect(qc.getQueryData<Book[]>(BOOKS_KEY)?.map((b) => b.id)).toEqual([ID2])
  })

  it('409 duplicate surfaces existingId and leaves the cache unchanged', async () => {
    const { api, qc, wrapper } = setup((req) =>
      req.method === 'GET'
        ? json([book()])
        : json({ title: 'Duplicate', status: 409, code: 'duplicate', existingId: ID1 }, 409),
    )
    const list = renderHook(() => useBooks(api), { wrapper })
    await waitFor(() => expect(list.result.current.data).toHaveLength(1))
    const { result } = renderHook(() => useCreateBook(api), { wrapper })
    const err = await failure(() => result.current.mutateAsync({ id: ID2, sourceUrl: link('Dune') }))
    expect(isMediaError(err)).toBe(true)
    expect(err).toMatchObject({ kind: 'duplicate', existingId: ID1, status: 409 })
    expect(qc.getQueryData<Book[]>(BOOKS_KEY)).toEqual([book()])
  })

  it('network failure surfaces a typed error, leaves the cache unchanged and queues nothing', async () => {
    let offline = false
    const { api, qc, calls, wrapper } = setup((req) =>
      req.method === 'GET' ? json([book()]) : offline ? Promise.reject(new TypeError('Failed to fetch')) : json(book()),
    )
    const list = renderHook(() => useBooks(api), { wrapper })
    await waitFor(() => expect(list.result.current.data).toHaveLength(1))
    offline = true
    const create = renderHook(() => useCreateBook(api), { wrapper })
    const update = renderHook(() => useUpdateBook(api), { wrapper })
    const del = renderHook(() => useDeleteBook(api), { wrapper })
    const e1 = await failure(() => create.result.current.mutateAsync({ id: ID2, sourceUrl: link('X') }))
    const e2 = await failure(() => update.result.current.mutateAsync({ id: ID1, patch: { isFavorite: true } }))
    const e3 = await failure(() => del.result.current.mutateAsync(ID1))
    for (const e of [e1, e2, e3]) expect(e).toMatchObject({ kind: 'network' })
    expect(qc.getQueryData<Book[]>(BOOKS_KEY)).toEqual([book()])
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(3) // each tried once, no retry/replay
  })

  it('410 gone and 404 are typed; gone triggers a list refetch that drops the stale row', async () => {
    let live = [book()]
    const { api, qc, wrapper } = setup((req) =>
      req.method === 'GET' ? json(live) : json({ title: 'Gone', status: 410, code: 'gone' }, 410),
    )
    const list = renderHook(() => useBooks(api), { wrapper })
    await waitFor(() => expect(list.result.current.data).toHaveLength(1))
    live = []
    const { result } = renderHook(() => useUpdateBook(api), { wrapper })
    const err = await failure(() => result.current.mutateAsync({ id: ID1, patch: { status: 'seen' } }))
    expect(err).toMatchObject({ kind: 'gone', status: 410 })
    await waitFor(() => expect(qc.getQueryData<Book[]>(BOOKS_KEY)).toEqual([]))
  })

  it('404 on delete maps to not_found; 400 carries field errors; empty error body is tolerated', async () => {
    const answers = [
      json({ title: 'Not found', status: 404, code: 'not_found' }, 404),
      json({ title: 'Bad', status: 400, code: 'validation', errors: [{ field: 'title', message: 'blank' }] }, 400),
      new Response(null, { status: 500 }),
    ]
    const { api, wrapper } = setup(() => answers.shift() ?? json({}))
    const del = renderHook(() => useDeleteBook(api), { wrapper })
    const create = renderHook(() => useCreateBook(api), { wrapper })
    expect(await failure(() => del.result.current.mutateAsync(ID1))).toMatchObject({ kind: 'not_found' })
    expect(
      await failure(() =>
        create.result.current.mutateAsync({ id: ID1, sourceUrl: 'https://www.google.com/search?q=' }),
      ),
    ).toMatchObject({
      kind: 'validation',
      fieldErrors: [{ field: 'title', message: 'blank' }],
    })
    expect(await failure(() => create.result.current.mutateAsync({ id: ID1, sourceUrl: link('x') }))).toMatchObject({
      kind: 'server',
      status: 500,
    })
  })
})

describe('movie mutations', () => {
  it('create, patch (tv fields) and the 409 existingId work the same way', async () => {
    let mode: 'ok' | 'dup' = 'ok'
    const tv = movie({ type: 'tv', seasonCount: 3 })
    const { api, qc, calls, wrapper } = setup((req) => {
      if (req.method === 'GET') return json([])
      if (mode === 'dup') return json({ title: 'Dup', status: 409, code: 'duplicate', existingId: ID1 }, 409)
      return json(
        req.method === 'PATCH' ? { ...tv, seasonCount: 4, tvStatus: 'ended', version: 2 } : tv,
        req.method === 'POST' ? 201 : 200,
      )
    })
    const list = renderHook(() => useMovies(api), { wrapper })
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true))
    const create = renderHook(() => useCreateMovie(api), { wrapper })
    const update = renderHook(() => useUpdateMovie(api), { wrapper })
    await act(async () => {
      await create.result.current.mutateAsync({ id: ID1, sourceUrl: link('Alien') })
    })
    await act(async () => {
      await update.result.current.mutateAsync({ id: ID1, patch: { seasonCount: 4, tvStatus: 'ended' } })
    })
    expect(qc.getQueryData<Movie[]>(MOVIES_KEY)).toMatchObject([{ id: ID1, seasonCount: 4, tvStatus: 'ended' }])
    expect(await calls.find((c) => c.method === 'PATCH')?.json()).toEqual({ seasonCount: 4, tvStatus: 'ended' })
    mode = 'dup'
    const err = await failure(() => create.result.current.mutateAsync({ id: ID2, sourceUrl: link('Alien') }))
    expect(err).toMatchObject({ kind: 'duplicate', existingId: ID1 })
    expect(qc.getQueryData<Movie[]>(MOVIES_KEY)).toHaveLength(1)
  })
})

describe('create: minimal body, provider problem codes, timeout', () => {
  it('the body is exactly {id, sourceUrl}, for a draft link and for a provider URL, books and movies', async () => {
    const { api, calls, wrapper } = setup((req) => (req.method === 'GET' ? json([]) : json(movie({ type: 'tv' }), 201)))
    const create = renderHook(() => useCreateMovie(api), { wrapper })
    const tmdb = 'https://www.themoviedb.org/tv/1396'
    await act(async () => {
      await create.result.current.mutateAsync({ id: ID1, sourceUrl: tmdb })
    })
    const post = calls.find((c) => c.method === 'POST')!
    expect(await post.json()).toEqual({ id: ID1, sourceUrl: tmdb })
    const cb = renderHook(() => useCreateBook(api), { wrapper })
    await act(async () => {
      await cb.result.current.mutateAsync({ id: ID2, sourceUrl: link('Dune') })
    })
    expect(await calls.filter((c) => c.method === 'POST')[1]!.json()).toEqual({
      id: ID2,
      sourceUrl: 'https://www.google.com/search?q=Dune',
    })
  })

  it.each([
    [422, 'source_not_found', 'source_not_found'],
    [409, 'source_key_missing', 'source_key_missing'],
    [409, 'source_key_invalid', 'source_key_invalid'],
    [422, 'source_key_rejected', 'source_key_rejected'],
    [409, 'something_new', 'server'],
    [409, 'duplicate', 'duplicate'],
    [429, 'rate_limited', 'rate_limited'],
    [502, 'provider_error', 'provider_error'],
    [503, 'provider_rate_limited', 'provider_rate_limited'],
    [504, 'provider_timeout', 'provider_timeout'],
  ])('%i %s maps to kind %s and creates nothing', async (status, code, kind) => {
    const { api, qc, wrapper } = setup((req) =>
      req.method === 'GET'
        ? json([])
        : new Response(JSON.stringify({ title: 'x', status, code }), {
            status,
            headers: { 'Content-Type': 'application/json', ...(status === 503 ? { 'Retry-After': '7' } : {}) },
          }),
    )
    const list = renderHook(() => useMovies(api), { wrapper })
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true))
    const create = renderHook(() => useCreateMovie(api), { wrapper })
    const err = await failure(() =>
      create.result.current.mutateAsync({ id: ID1, sourceUrl: 'https://www.themoviedb.org/movie/1' }),
    )
    expect(err).toMatchObject({ kind, status })
    if (status === 503) expect((err as MediaError).retryAfter).toBe(7)
    expect(qc.getQueryData<Movie[]>(MOVIES_KEY)).toEqual([])
  })

  it('a client-side timeout is its own kind and a retry reuses the same id', async () => {
    let n = 0
    const { api, calls, wrapper } = setup((req) => {
      if (req.method === 'GET') return json([])
      if (++n === 1) throw new DOMException('timed out', 'TimeoutError')
      return json(book(), 201)
    })
    const create = renderHook(() => useCreateBook(api), { wrapper })
    const err = await failure(() => create.result.current.mutateAsync({ id: ID1, sourceUrl: link('Dune') }))
    expect(err).toMatchObject({ kind: 'timeout' })
    await act(async () => {
      await create.result.current.mutateAsync({ id: ID1, sourceUrl: link('Dune') })
    })
    const ids = await Promise.all(
      calls.filter((c) => c.method === 'POST').map(async (c) => (await c.clone().json()).id),
    )
    expect(ids).toEqual([ID1, ID1])
  })

  it('create requests carry an abort signal (15 s timeout)', async () => {
    const signals: (AbortSignal | undefined)[] = []
    const { api, wrapper } = setup((req) => {
      if (req.method === 'POST') signals.push(req.signal)
      return req.method === 'GET' ? json([]) : json(book(), 201)
    })
    const create = renderHook(() => useCreateBook(api), { wrapper })
    await act(async () => {
      await create.result.current.mutateAsync({ id: ID1, sourceUrl: link('Dune') })
    })
    expect(signals[0]).toBeDefined()
  })
})

function deferred() {
  let resolve!: (r: Response) => void
  const promise = new Promise<Response>((r) => (resolve = r))
  return { promise, resolve }
}
const ID3 = '00000000-0000-0000-0000-000000000003'
const three = () => [book(), book({ id: ID2, title: 'Emma' }), book({ id: ID3, title: 'Ulysses' })]

describe('optimistic mutations', () => {
  it('patch changes the cache before the server answers, success keeps it and does not refetch', async () => {
    const d = deferred()
    const { api, qc, calls, wrapper } = setup((req) => (req.method === 'GET' ? json(three()) : d.promise))
    const list = renderHook(() => useBooks(api), { wrapper })
    await waitFor(() => expect(list.result.current.data).toHaveLength(3))
    const { result } = renderHook(() => useUpdateBook(api), { wrapper })
    let p!: Promise<unknown>
    act(() => {
      p = result.current.mutateAsync({ id: ID1, patch: { isFavorite: true, version: 1 } })
    })
    await waitFor(() => expect(qc.getQueryData<Book[]>(BOOKS_KEY)?.[0]?.isFavorite).toBe(true))
    await waitFor(() => expect(list.result.current.data?.[0]?.isFavorite).toBe(true))
    await act(async () => {
      d.resolve(json(book({ isFavorite: true, version: 2 })))
      await p
    })
    expect(qc.getQueryData<Book[]>(BOOKS_KEY)?.[0]).toMatchObject({ isFavorite: true, version: 2 })
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(1)
  })

  it.each([
    ['500', () => json({ code: 'x' }, 500), 'server'],
    ['network failure', () => Promise.reject(new TypeError('Failed to fetch')), 'network'],
  ])('patch rolls back on %s with a typed error', async (_n, fail, kind) => {
    const { api, qc, wrapper } = setup((req) => (req.method === 'GET' ? json(three()) : fail()))
    const list = renderHook(() => useBooks(api), { wrapper })
    await waitFor(() => expect(list.result.current.data).toHaveLength(3))
    const { result } = renderHook(() => useUpdateBook(api), { wrapper })
    const err = await failure(() => result.current.mutateAsync({ id: ID2, patch: { status: 'seen' } }))
    expect(err).toMatchObject({ kind })
    expect(qc.getQueryData<Book[]>(BOOKS_KEY)).toEqual(three())
  })

  it('movie delete keeps the removal on success', async () => {
    const { api, qc, wrapper } = setup((req) =>
      req.method === 'GET' ? json([movie(), movie({ id: ID2 })]) : new Response(null, { status: 204 }),
    )
    const list = renderHook(() => useMovies(api), { wrapper })
    await waitFor(() => expect(list.result.current.data).toHaveLength(2))
    const { result } = renderHook(() => useDeleteMovie(api), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(ID1)
    })
    expect(qc.getQueryData<Movie[]>(MOVIES_KEY)?.map((m) => m.id)).toEqual([ID2])
  })

  it('two quick toggles on different rows do not clobber each other, even when one fails', async () => {
    let server = three() // the refetch after A's failure must see B's saved change
    const d1 = deferred()
    const d2 = deferred()
    const { api, qc, wrapper } = setup((req) => {
      if (req.method === 'GET') return json(server)
      return req.url.endsWith(ID1) ? d1.promise : d2.promise
    })
    const list = renderHook(() => useBooks(api), { wrapper })
    await waitFor(() => expect(list.result.current.data).toHaveLength(3))
    const { result } = renderHook(() => useUpdateBook(api), { wrapper })
    let p1!: Promise<unknown>
    let p2!: Promise<unknown>
    act(() => {
      p1 = result.current.mutateAsync({ id: ID1, patch: { isFavorite: true } }).catch((e) => e)
    })
    await waitFor(() => expect(qc.getQueryData<Book[]>(BOOKS_KEY)?.[0]?.isFavorite).toBe(true))
    act(() => {
      p2 = result.current.mutateAsync({ id: ID2, patch: { isFavorite: true } })
    })
    await waitFor(() => expect(qc.getQueryData<Book[]>(BOOKS_KEY)?.[1]?.isFavorite).toBe(true))
    await act(async () => {
      d1.resolve(json({ code: 'x' }, 500))
      await p1
    })
    expect(qc.getQueryData<Book[]>(BOOKS_KEY)?.map((b) => b.isFavorite)).toEqual([false, true, false])
    await act(async () => {
      server = server.map((b) => (b.id === ID2 ? { ...b, isFavorite: true, version: 2 } : b))
      d2.resolve(json(server[1]))
      await p2
    })
    await waitFor(() =>
      expect(qc.getQueryData<Book[]>(BOOKS_KEY)?.map((b) => b.isFavorite)).toEqual([false, true, false]),
    )
  })

  it('410 on patch keeps the toast path: no rollback, the list is invalidated', async () => {
    let live = three()
    const { api, qc, wrapper } = setup((req) => (req.method === 'GET' ? json(live) : json({ code: 'gone' }, 410)))
    const list = renderHook(() => useBooks(api), { wrapper })
    await waitFor(() => expect(list.result.current.data).toHaveLength(3))
    live = live.slice(1)
    const { result } = renderHook(() => useUpdateBook(api), { wrapper })
    const err = await failure(() => result.current.mutateAsync({ id: ID1, patch: { status: 'seen' } }))
    expect(err).toMatchObject({ kind: 'gone' })
    await waitFor(() => expect(qc.getQueryData<Book[]>(BOOKS_KEY)?.map((b) => b.id)).toEqual([ID2, ID3]))
  })

  it('a response that is not newer than the cached row is ignored (out of order)', async () => {
    const d1 = deferred()
    const d2 = deferred()
    let n = 0
    const { api, qc, wrapper } = setup((req) =>
      req.method === 'GET' ? json(three()) : ++n === 1 ? d1.promise : d2.promise,
    )
    const list = renderHook(() => useBooks(api), { wrapper })
    await waitFor(() => expect(list.result.current.data).toHaveLength(3))
    const { result } = renderHook(() => useUpdateBook(api), { wrapper })
    let p1!: Promise<unknown>
    let p2!: Promise<unknown>
    act(() => {
      p1 = result.current.mutateAsync({ id: ID1, patch: { isFavorite: true } })
    })
    await waitFor(() => expect(n).toBe(1))
    act(() => {
      p2 = result.current.mutateAsync({ id: ID1, patch: { status: 'seen' } })
    })
    await waitFor(() => expect(n).toBe(2))
    await act(async () => {
      d2.resolve(json(book({ isFavorite: true, status: 'seen', version: 3 })))
      await p2
    })
    await act(async () => {
      d1.resolve(json(book({ isFavorite: true, version: 2 })))
      await p1
    })
    expect(qc.getQueryData<Book[]>(BOOKS_KEY)?.[0]).toMatchObject({ isFavorite: true, status: 'seen', version: 3 })
  })

  it('the optimistic patch bumps updatedAt, and a failure restores it', async () => {
    const d = deferred()
    const { api, qc, wrapper } = setup((req) => (req.method === 'GET' ? json(three()) : d.promise))
    const list = renderHook(() => useBooks(api), { wrapper })
    await waitFor(() => expect(list.result.current.data).toHaveLength(3))
    const { result } = renderHook(() => useUpdateBook(api), { wrapper })
    let p!: Promise<unknown>
    act(() => {
      p = result.current.mutateAsync({ id: ID1, patch: { isFavorite: true } }).catch((e) => e)
    })
    await waitFor(() => expect(qc.getQueryData<Book[]>(BOOKS_KEY)?.[0]?.updatedAt).not.toBe(base.updatedAt))
    await act(async () => {
      d.resolve(json({ code: 'x' }, 500))
      await p
    })
    expect(qc.getQueryData<Book[]>(BOOKS_KEY)?.[0]?.updatedAt).toBe(base.updatedAt)
  })
})
