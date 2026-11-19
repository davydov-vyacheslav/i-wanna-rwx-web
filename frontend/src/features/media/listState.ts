import { useCallback, useState } from 'react'
import type { ApiClient } from '../../api/client'
import { useMe } from '../identity/useMe'
import { activeCount, defaultFilters, isFilterActive, type Filters, type TriState, type TypeFilter } from './filters'
import type { ListState } from './counts'
import { DEFAULT_SORT, type SortOption } from './sort'

export type ListName = 'books' | 'movies'

export function defaultListState(): ListState {
  return { filters: defaultFilters(), sort: DEFAULT_SORT, search: '' }
}

/** Device-local, keyed by list and user id (never synced). */
export function storageKey(list: ListName, userId: string): string {
  return `rwx.list.${list}.${userId}`
}

const TRI: readonly unknown[] = ['all', 'include', 'exclude']
const TYPES: readonly unknown[] = ['all', 'movie', 'tv']
const SORTS: readonly unknown[] = ['titleAsc', 'updatedDesc']

/** Strict shape check; anything unexpected yields null so the caller falls back to the default. */
function parse(raw: string | null, list: ListName): ListState | null {
  if (raw === null) return null
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return null
  }
  if (v === null || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const f = o.filters as Record<string, unknown> | null
  if (f === null || typeof f !== 'object') return null
  if (!TRI.includes(f.favorite) || !TRI.includes(f.seen) || !TRI.includes(f.draft) || !TRI.includes(f.ended))
    return null
  if (!TYPES.includes(f.type) || !SORTS.includes(o.sort) || typeof o.search !== 'string') return null
  const filters: Filters = {
    type: f.type as TypeFilter,
    favorite: f.favorite as TriState,
    seen: f.seen as TriState,
    draft: f.draft as TriState,
    ended: f.ended as TriState,
  }
  // books have neither type nor ended
  if (list === 'books') {
    filters.type = 'all'
    filters.ended = 'all'
  } else if (filters.type !== 'tv') {
    filters.ended = 'all'
  }
  return { filters, sort: o.sort as SortOption, search: o.search }
}

export function loadListState(list: ListName, userId: string | undefined): ListState {
  if (!userId) return defaultListState()
  try {
    return parse(localStorage.getItem(storageKey(list, userId)), list) ?? defaultListState()
  } catch {
    return defaultListState()
  }
}

function saveListState(list: ListName, userId: string | undefined, state: ListState): void {
  if (!userId) return
  try {
    localStorage.setItem(storageKey(list, userId), JSON.stringify(state))
  } catch {
    // storage full or blocked: the state just stays in memory
  }
}

/**
 * Filters, sort and list search for one list, persisted per user on this device.
 * Defaults (seen hidden, title A-Z, empty search) apply until a user id is known and
 * whenever the stored value is missing or unreadable.
 */
export function useListState(list: ListName, opts: { userId?: string; api?: ApiClient } = {}) {
  const { me } = useMe(opts.api)
  const userId = opts.userId ?? me?.id
  const key = `${list}:${userId ?? ''}`
  const [slot, setSlot] = useState(() => ({ key, state: loadListState(list, userId) }))
  let state = slot.state
  if (slot.key !== key) {
    // list or user changed: reload (render-phase reset, the documented pattern)
    state = loadListState(list, userId)
    setSlot({ key, state })
  }

  const update = useCallback(
    (fn: (s: ListState) => ListState) => {
      setSlot((prev) => {
        const next = fn(prev.key === key ? prev.state : loadListState(list, userId))
        saveListState(list, userId, next)
        return { key, state: next }
      })
    },
    [key, list, userId],
  )

  const kind = list === 'books' ? 'book' : 'movie'
  return {
    state,
    filterCount: activeCount(state.filters, kind),
    filterActive: isFilterActive(state.filters, kind),
    setFilters: useCallback((filters: Filters) => update((s) => ({ ...s, filters })), [update]),
    setSort: useCallback((sort: SortOption) => update((s) => ({ ...s, sort })), [update]),
    setSearch: useCallback((search: string) => update((s) => ({ ...s, search })), [update]),
    /** Back to the default state (seen hidden); keeps sort and search. */
    resetFilters: useCallback(() => update((s) => ({ ...s, filters: defaultFilters() })), [update]),
  }
}
