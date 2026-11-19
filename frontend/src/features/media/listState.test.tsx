import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiClient } from '../../api/client'
import { defaultFilters } from './filters'
import { defaultListState, loadListState, storageKey, useListState } from './listState'

const api = createApiClient({ baseUrl: 'http://localhost', fetch: async () => new Response('{}', { status: 401 }) })
const U1 = 'user-1'
const U2 = 'user-2'
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('useListState', () => {
  it('defaults to seen=exclude, title sort, empty search, badge 1', () => {
    const { result } = renderHook(() => useListState('books', { userId: U1, api }), { wrapper })
    expect(result.current.state).toEqual(defaultListState())
    expect(result.current.state.filters.seen).toBe('exclude')
    expect(result.current.filterCount).toBe(1)
    expect(result.current.filterActive).toBe(true)
  })

  it('persists per user and list, and reloads', () => {
    const first = renderHook(() => useListState('books', { userId: U1, api }), { wrapper })
    act(() => {
      first.result.current.setFilters({ ...defaultFilters(), favorite: 'include' })
      first.result.current.setSort('updatedDesc')
      first.result.current.setSearch('dune')
    })
    expect(first.result.current.filterCount).toBe(2)
    first.unmount()

    const again = renderHook(() => useListState('books', { userId: U1, api }), { wrapper })
    expect(again.result.current.state).toEqual({
      filters: { ...defaultFilters(), favorite: 'include' },
      sort: 'updatedDesc',
      search: 'dune',
    })
    const other = renderHook(() => useListState('books', { userId: U2, api }), { wrapper })
    expect(other.result.current.state).toEqual(defaultListState())
    const movies = renderHook(() => useListState('movies', { userId: U1, api }), { wrapper })
    expect(movies.result.current.state).toEqual(defaultListState())
  })

  it('reset returns to the default filters and counts 1', () => {
    const { result } = renderHook(() => useListState('books', { userId: U1, api }), { wrapper })
    act(() => result.current.setFilters({ ...defaultFilters(), seen: 'all', draft: 'include' }))
    expect(result.current.filterCount).toBe(1)
    act(() => result.current.resetFilters())
    expect(result.current.state.filters).toEqual(defaultFilters())
    expect(result.current.filterCount).toBe(1)
  })

  it('switches state when the user changes', () => {
    let userId = U1
    const { result, rerender } = renderHook(() => useListState('books', { userId, api }), { wrapper })
    act(() => result.current.setSearch('mine'))
    userId = U2
    rerender()
    expect(result.current.state.search).toBe('')
    userId = U1
    rerender()
    expect(result.current.state.search).toBe('mine')
  })
})

describe('loadListState', () => {
  it.each([
    ['not json', '{oops'],
    ['null', 'null'],
    ['wrong type', '42'],
    ['missing filters', '{"sort":"titleAsc","search":""}'],
    [
      'bad tri-state',
      JSON.stringify({ filters: { ...defaultFilters(), seen: 'maybe' }, sort: 'titleAsc', search: '' }),
    ],
    ['bad sort', JSON.stringify({ filters: defaultFilters(), sort: 'random', search: '' })],
    ['bad search', JSON.stringify({ filters: defaultFilters(), sort: 'titleAsc', search: 5 })],
  ])('corrupt value (%s) -> default', (_name, raw) => {
    localStorage.setItem(storageKey('books', U1), raw)
    expect(loadListState('books', U1)).toEqual(defaultListState())
  })

  it('unreadable storage -> default, and writing never throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    const { result } = renderHook(() => useListState('books', { userId: U1, api }), { wrapper })
    expect(result.current.state).toEqual(defaultListState())
    act(() => result.current.setSearch('x'))
    expect(result.current.state.search).toBe('x')
  })

  it('books ignore a stored type and ended', () => {
    localStorage.setItem(
      storageKey('books', U1),
      JSON.stringify({ filters: { ...defaultFilters(), type: 'tv', ended: 'include' }, sort: 'titleAsc', search: '' }),
    )
    const s = loadListState('books', U1)
    expect(s.filters.type).toBe('all')
    expect(s.filters.ended).toBe('all')
  })

  it('no user id -> default and nothing stored', () => {
    const { result } = renderHook(() => useListState('books', { userId: undefined, api }), { wrapper })
    act(() => result.current.setSearch('x'))
    expect(localStorage.length).toBe(0)
  })
})
