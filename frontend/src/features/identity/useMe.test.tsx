import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { authSignal, createApiClient } from '../../api/client'
import { useLogout, useMe, useSyncTimeZone } from './useMe'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
)

const me = { id: '11111111-1111-1111-1111-111111111111', displayName: 'octo', timeZone: 'UTC' }
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function stub(handler: (req: Request) => Response) {
  const calls: Request[] = []
  const fetchFn: typeof fetch = (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init)
    calls.push(req)
    return Promise.resolve(handler(req))
  }
  const api = createApiClient({ baseUrl: 'http://localhost', fetch: fetchFn, csrfToken: () => 'tok' })
  return { api, calls }
}

beforeEach(() => authSignal.reset())

describe('CSRF header', () => {
  it('is sent on POST, PATCH, DELETE and not on GET', async () => {
    const { api, calls } = stub((req) => (req.method === 'GET' || req.method === 'PATCH' ? json(me) : new Response(null, { status: 204 })))
    await api.GET('/api/v1/me')
    await api.POST('/api/v1/auth/logout')
    await api.PATCH('/api/v1/me', { body: { timeZone: 'Europe/Kyiv' } })
    await api.DELETE('/api/v1/me')
    const byMethod = Object.fromEntries(calls.map((c) => [c.method, c.headers.get('X-XSRF-TOKEN')]))
    expect(byMethod).toEqual({ GET: null, POST: 'tok', PATCH: 'tok', DELETE: 'tok' })
  })
})

describe('401 handling', () => {
  it('useMe reports signed out and raises the signal', async () => {
    const { api } = stub(() => json({ code: 'unauthorized' }, 401))
    const { result } = renderHook(() => useMe(api), { wrapper })
    await waitFor(() => expect(result.current.signedOut).toBe(true))
    expect(result.current.me).toBeUndefined()
    expect(authSignal.isSignedOut()).toBe(true)
  })

  it('useMe returns the user on 200', async () => {
    const { api } = stub(() => json(me))
    const { result } = renderHook(() => useMe(api), { wrapper })
    await waitFor(() => expect(result.current.me?.displayName).toBe('octo'))
    expect(result.current.signedOut).toBe(false)
  })
})

describe('timezone sync', () => {
  it('does not PATCH when the zone is equal', async () => {
    const { api, calls } = stub(() => json(me))
    renderHook(() => useSyncTimeZone(me, api, 'UTC'), { wrapper })
    await new Promise((r) => setTimeout(r, 20))
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0)
  })

  it('PATCHes once when the zone differs', async () => {
    const { api, calls } = stub(() => json({ ...me, timeZone: 'Europe/Kyiv' }))
    const { rerender } = renderHook(() => useSyncTimeZone(me, api, 'Europe/Kyiv'), { wrapper })
    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1))
    rerender()
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1)
    expect(await first(calls).json()).toEqual({ timeZone: 'Europe/Kyiv' })
  })
})

describe('useLogout', () => {
  it('POSTs logout with CSRF and marks signed out', async () => {
    const { api, calls } = stub(() => new Response(null, { status: 204 }))
    const { result } = renderHook(() => useLogout(api), { wrapper })
    await act(() => result.current.mutateAsync())
    expect(first(calls).method).toBe('POST')
    expect(first(calls).url).toContain('/api/v1/auth/logout')
    expect(first(calls).headers.get('X-XSRF-TOKEN')).toBe('tok')
    expect(authSignal.isSignedOut()).toBe(true)
  })
})

function first(calls: Request[]): Request {
  const c = calls[0]
  if (!c) throw new Error('no request recorded')
  return c
}
