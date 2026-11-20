import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { createApiClient } from '../../api/client'
import { json } from '../../test/fixtures'
import { isApiError } from '../../api/errors'
import {
  remindersKey,
  useCreateReminder,
  useDeleteReminder,
  useRenewReminder,
  useReminders,
  useUpdateReminder,
} from './hooks'
import type { ReminderType, Subscription } from './types'

const ID1 = '00000000-0000-0000-0000-000000000001'
const ID2 = '00000000-0000-0000-0000-000000000002'
const row = (o: Partial<Subscription> = {}): Subscription => ({
  id: ID1,
  userId: 'u',
  name: 'Netflix',
  expiryDate: '2026-03-15',
  renewalPattern: 'monthly',
  remindDays: 3,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...o,
})

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

const TYPES: ReminderType[] = ['subscriptions', 'licenses']

describe.each(TYPES)('%s hooks', (type) => {
  const key = remindersKey(type)
  const url = `http://localhost/api/v1/${type}`

  it('refetch replaces the cached list', async () => {
    let items = [row()]
    const { api, qc, wrapper } = setup(() => json(items))
    const { result } = renderHook(() => useReminders(type, api), { wrapper })
    await waitFor(() => expect(result.current.data).toHaveLength(1))
    items = [row({ id: ID2, name: 'Adobe' })]
    await act(async () => {
      await result.current.refetch()
    })
    expect(qc.getQueryData<Subscription[]>(key)?.map((r) => r.name)).toEqual(['Adobe'])
  })

  it('create posts the client id and fields, retries with the same id, and stores the row', async () => {
    let fail = true
    const { api, calls, qc, wrapper } = setup((req) => {
      if (fail) throw new TypeError('offline')
      return json(row(), req.method === 'POST' ? 201 : 200, {})
    })
    qc.setQueryData(key, [])
    const { result } = renderHook(() => useCreateReminder(type, api), { wrapper })
    const body = {
      id: ID1,
      name: 'Netflix',
      renewalPattern: 'monthly',
      expiryDate: '2026-03-15',
      remindDays: 3,
    } as const
    const err = await failure(() => result.current.mutateAsync(body))
    expect(isApiError(err) && err.kind).toBe('network')
    expect(qc.getQueryData(key)).toEqual([])
    fail = false
    await act(async () => {
      await result.current.mutateAsync(body)
    })
    expect(calls).toHaveLength(2)
    for (const c of calls) {
      expect(c.method).toBe('POST')
      expect(c.url).toBe(url)
      expect(await c.clone().json()).toEqual(body)
    }
    expect(qc.getQueryData<Subscription[]>(key)).toEqual([row()])
  })

  it('update patches the changed fields and stores the returned row', async () => {
    const { api, calls, qc, wrapper } = setup(() => json(row({ name: 'Hulu', version: 2 })))
    qc.setQueryData(key, [row()])
    const { result } = renderHook(() => useUpdateReminder(type, api), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: ID1, patch: { name: 'Hulu' } })
    })
    expect(calls[0]!.method).toBe('PATCH')
    expect(calls[0]!.url).toBe(`${url}/${ID1}`)
    expect(await calls[0]!.json()).toEqual({ name: 'Hulu' })
    expect(qc.getQueryData<Subscription[]>(key)?.[0]?.name).toBe('Hulu')
  })

  it('renew sends expectedExpiryDate, waits for the server and stores the new date', async () => {
    let answer!: () => void
    const gate = new Promise<void>((r) => (answer = r))
    const { api, calls, qc, wrapper } = setup(async () => {
      await gate
      return json(row({ expiryDate: '2026-04-15', version: 2 }))
    })
    qc.setQueryData(key, [row()])
    const { result } = renderHook(() => useRenewReminder(type, api), { wrapper })
    let pending!: Promise<unknown>
    act(() => {
      pending = result.current.mutateAsync({ id: ID1, expectedExpiryDate: '2026-03-15' })
    })
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(qc.getQueryData<Subscription[]>(key)?.[0]?.expiryDate).toBe('2026-03-15')
    await act(async () => {
      answer()
      await pending
    })
    expect(calls[0]!.method).toBe('POST')
    expect(calls[0]!.url).toBe(`${url}/${ID1}/renew`)
    expect(await calls[0]!.json()).toEqual({ expectedExpiryDate: '2026-03-15' })
    expect(qc.getQueryData<Subscription[]>(key)?.[0]?.expiryDate).toBe('2026-04-15')
  })

  it('a network failure leaves the cache unchanged', async () => {
    const { api, calls, qc, wrapper } = setup(() => {
      throw new TypeError('offline')
    })
    qc.setQueryData(key, [row()])
    const { result } = renderHook(() => useRenewReminder(type, api), { wrapper })
    const err = await failure(() => result.current.mutateAsync({ id: ID1, expectedExpiryDate: '2026-03-15' }))
    expect(isApiError(err) && err.kind).toBe('network')
    expect(qc.getQueryData(key)).toEqual([row()])
    expect(calls).toHaveLength(1)
  })

  it('a 410 on create changes nothing; a 410 on renew refetches the list so the row leaves it', async () => {
    const { api, calls, qc, wrapper } = setup((req) => (req.method === 'GET' ? json([]) : json({ code: 'gone' }, 410)))
    qc.setQueryData(key, [row({ id: ID2 })])
    const create = renderHook(() => useCreateReminder(type, api), { wrapper })
    const err = await failure(() =>
      create.result.current.mutateAsync({ id: ID1, name: 'x', renewalPattern: 'monthly', remindDays: 3 }),
    )
    expect(isApiError(err) && err.kind).toBe('gone')
    expect(qc.getQueryData<Subscription[]>(key)).toEqual([row({ id: ID2 })])
    expect(calls.map((c) => c.method)).toEqual(['POST'])

    const renew = renderHook(() => useReminders(type, api), { wrapper })
    const renewer = renderHook(() => useRenewReminder(type, api), { wrapper })
    await waitFor(() => expect(renew.result.current.data).toEqual([]))
    qc.setQueryData(key, [row()])
    const err2 = await failure(() => renewer.result.current.mutateAsync({ id: ID1, expectedExpiryDate: '2026-03-15' }))
    expect(isApiError(err2) && err2.kind).toBe('gone')
    await waitFor(() => expect(qc.getQueryData(key)).toEqual([]))
  })

  it('delete removes the row once the server answers 204', async () => {
    const { api, calls, qc, wrapper } = setup(() => new Response(null, { status: 204 }))
    qc.setQueryData(key, [row()])
    const { result } = renderHook(() => useDeleteReminder(type, api), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(ID1)
    })
    expect(calls[0]!.method).toBe('DELETE')
    expect(calls[0]!.url).toBe(`${url}/${ID1}`)
    expect(qc.getQueryData(key)).toEqual([])
  })
})
