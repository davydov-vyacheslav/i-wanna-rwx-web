import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApiClient } from '../../api/client'
import { defaultRemindersState, loadRemindersState, storageKey, useRemindersState } from './listState'

const api = createApiClient({ baseUrl: 'http://localhost', fetch: async () => new Response('{}', { status: 401 }) })
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

beforeEach(() => localStorage.clear())

describe('useRemindersState', () => {
  it('defaults to Subscriptions and no filter', () => {
    const { result } = renderHook(() => useRemindersState({ userId: 'u1', api }), { wrapper })
    expect(result.current.state).toEqual(defaultRemindersState())
    expect(result.current.state.segment).toBe('subscriptions')
  })

  it('persists segment and per-segment filter per user, and reloads', () => {
    const first = renderHook(() => useRemindersState({ userId: 'u1', api }), { wrapper })
    act(() => {
      first.result.current.setSegment('licenses')
      first.result.current.setExpiring('licenses', 'include')
    })
    first.unmount()
    const again = renderHook(() => useRemindersState({ userId: 'u1', api }), { wrapper })
    expect(again.result.current.state).toEqual({
      segment: 'licenses',
      expiring: { subscriptions: 'all', licenses: 'include' },
    })
    const other = renderHook(() => useRemindersState({ userId: 'u2', api }), { wrapper })
    expect(other.result.current.state).toEqual(defaultRemindersState())
  })
})

describe('loadRemindersState', () => {
  it.each([
    ['not json', '{oops'],
    ['null', 'null'],
    ['unknown segment', '{"segment":"x","expiring":{"subscriptions":"all","licenses":"all"}}'],
    ['bad filter', '{"segment":"licenses","expiring":{"subscriptions":"maybe","licenses":"all"}}'],
    ['missing filters', '{"segment":"licenses"}'],
  ])('%s gives the defaults', (_name, raw) => {
    localStorage.setItem(storageKey('u1'), raw)
    expect(loadRemindersState('u1')).toEqual(defaultRemindersState())
  })

  it('missing value and unknown user give the defaults', () => {
    expect(loadRemindersState('u1')).toEqual(defaultRemindersState())
    expect(loadRemindersState(undefined)).toEqual(defaultRemindersState())
  })
})
