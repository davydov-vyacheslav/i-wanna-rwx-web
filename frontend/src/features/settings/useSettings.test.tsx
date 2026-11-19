import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { json } from '../../test/fixtures'
import { authSignal, createApiClient } from '../../api/client'
import { markTimeZoneChosen, useLocale, useSyncTimeZone } from './useSettings'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
)

const USER = '11111111-1111-1111-1111-111111111111'
const settings = (over: object = {}) => ({
  userId: USER,
  timeZone: 'UTC',
  locale: 'en',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
})

function stub(stored: object | Response) {
  const calls: Request[] = []
  const fetchFn: typeof fetch = (input, init) => {
    const req = new Request(input, init)
    calls.push(req)
    if (stored instanceof Response) return Promise.resolve(stored.clone())
    if (req.method === 'PATCH') return Promise.resolve(json(settings({ timeZone: 'Europe/Kyiv' })))
    return Promise.resolve(json(stored))
  }
  const api = createApiClient({ baseUrl: 'http://localhost', fetch: fetchFn, csrfToken: () => 'tok' })
  return { api, calls }
}

const patches = (calls: Request[]) => calls.filter((c) => c.method === 'PATCH')

/** Lets the effect and any request it would start run before asserting that nothing was sent. */
async function settle(calls: Request[]) {
  await waitFor(() => expect(calls.filter((c) => c.method === 'GET')).toHaveLength(1))
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
  expect(patches(calls)).toHaveLength(0)
}

beforeEach(() => {
  authSignal.reset()
  localStorage.clear()
})

describe('timezone sync', () => {
  it('stored UTC + device UTC: no request', async () => {
    const { api, calls } = stub(settings())
    renderHook(() => useSyncTimeZone(USER, api, 'UTC'), { wrapper })
    await settle(calls)
  })

  it('stored UTC + device Kyiv: one PATCH /settings with the zone', async () => {
    const { api, calls } = stub(settings())
    const { rerender } = renderHook(() => useSyncTimeZone(USER, api, 'Europe/Kyiv'), { wrapper })
    await waitFor(() => expect(patches(calls)).toHaveLength(1))
    rerender()
    expect(patches(calls)).toHaveLength(1)
    expect(new URL(patches(calls)[0]!.url).pathname).toBe('/api/v1/settings')
    expect(await patches(calls)[0]!.json()).toEqual({ timeZone: 'Europe/Kyiv' })
  })

  it('stored London + device Tokyo: no request', async () => {
    const { api, calls } = stub(settings({ timeZone: 'Europe/London' }))
    renderHook(() => useSyncTimeZone(USER, api, 'Asia/Tokyo'), { wrapper })
    await settle(calls)
  })

  it('chosen flag set: no request', async () => {
    markTimeZoneChosen(USER)
    const { api, calls } = stub(settings())
    renderHook(() => useSyncTimeZone(USER, api, 'Europe/Kyiv'), { wrapper })
    await settle(calls)
  })

  it('the chosen flag is per user', async () => {
    markTimeZoneChosen('someone-else')
    const { api, calls } = stub(settings())
    renderHook(() => useSyncTimeZone(USER, api, 'Europe/Kyiv'), { wrapper })
    await waitFor(() => expect(patches(calls)).toHaveLength(1))
  })

  it('no user: nothing is requested', async () => {
    const { api, calls } = stub(settings())
    renderHook(() => useSyncTimeZone(undefined, api, 'Europe/Kyiv'), { wrapper })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(calls).toHaveLength(0)
  })

  it('settings failing to load: no PATCH', async () => {
    const { api, calls } = stub(json({ code: 'boom' }, 500))
    renderHook(() => useSyncTimeZone(USER, api, 'Europe/Kyiv'), { wrapper })
    await settle(calls)
  })
})

describe('useLocale', () => {
  it('stored locale wins; the device locale applies while loading or failing', async () => {
    const { api } = stub(settings({ locale: 'uk' }))
    const { result } = renderHook(() => useLocale(api), { wrapper })
    expect(result.current).toBe('en')
    await waitFor(() => expect(result.current).toBe('uk'))

    const failing = stub(json({ code: 'boom' }, 500))
    const r2 = renderHook(() => useLocale(failing.api), { wrapper })
    await waitFor(() => expect(failing.calls).toHaveLength(1))
    expect(r2.result.current).toBe('en')
  })
})
