import { isDraft, type ListItem, type MediaKind } from './types'

export type TriState = 'all' | 'include' | 'exclude'
export type TypeFilter = 'all' | 'movie' | 'tv'

/** Books ignore `type` and `ended`; they stay at their defaults. */
export interface Filters {
  type: TypeFilter
  favorite: TriState
  seen: TriState
  draft: TriState
  ended: TriState
}

/** Default for books and movies: seen items hidden. */
export function defaultFilters(): Filters {
  return { type: 'all', favorite: 'all', seen: 'exclude', draft: 'all', ended: 'all' }
}

const NEXT: Record<TriState, TriState> = { all: 'include', include: 'exclude', exclude: 'all' }

/** One tap on a tri-state row: all -> include -> exclude -> all. */
export function cycle(state: TriState): TriState {
  return NEXT[state]
}

export function cycleFilter(filters: Filters, key: 'favorite' | 'seen' | 'draft' | 'ended'): Filters {
  return { ...filters, [key]: cycle(filters[key]) }
}

/** Single-select type; tapping the selected one returns to all. Leaving series resets ended. */
export function selectType(filters: Filters, type: Exclude<TypeFilter, 'all'>): Filters {
  const next: TypeFilter = filters.type === type ? 'all' : type
  return { ...filters, type: next, ended: next === 'tv' ? filters.ended : 'all' }
}

/** Reset returns to the default (which is itself an active filter). */
export function resetFilters(): Filters {
  return defaultFilters()
}

/** Number of active criteria (type, favorite, seen, draft, ended; 1 each). The default counts: 1. */
export function activeCount(filters: Filters, kind: MediaKind = 'movie'): number {
  let n = 0
  if (kind === 'movie') {
    if (filters.type !== 'all') n++
    if (filters.type === 'tv' && filters.ended !== 'all') n++
  }
  if (filters.favorite !== 'all') n++
  if (filters.seen !== 'all') n++
  if (filters.draft !== 'all') n++
  return n
}

/** Filled filter icon when any criterion differs from `all`. */
export function isFilterActive(filters: Filters, kind: MediaKind = 'movie'): boolean {
  return activeCount(filters, kind) > 0
}

/** The sheet shows the type buttons only if more than one type exists in the list. */
export function showTypeButtons(items: readonly { type: 'movie' | 'tv' }[]): boolean {
  return new Set(items.map((i) => i.type)).size > 1
}

function tri(state: TriState, value: boolean): boolean {
  return state === 'all' || (state === 'include' ? value : !value)
}

interface FilterableMovie extends ListItem {
  type: 'movie' | 'tv'
  tvStatus?: 'ongoing' | 'ended'
}

export function applyFilters<T extends ListItem>(items: readonly T[], filters: Filters, kind: MediaKind): T[] {
  return items.filter((item) => {
    if (!tri(filters.favorite, item.isFavorite === true)) return false
    if (!tri(filters.seen, item.status === 'seen')) return false
    if (!tri(filters.draft, isDraft(item))) return false
    if (kind === 'movie') {
      const m = item as unknown as FilterableMovie
      if (filters.type !== 'all' && m.type !== filters.type) return false
      // ended only applies to series; unknown status matches `exclude`
      if (filters.type === 'tv' && !tri(filters.ended, m.tvStatus === 'ended')) return false
    }
    return true
  })
}
