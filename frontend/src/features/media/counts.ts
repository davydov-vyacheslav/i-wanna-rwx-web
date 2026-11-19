import { applyFilters, type Filters } from './filters'
import { applySearch } from './search'
import { sortItems, type SortOption } from './sort'
import type { ListItem, MediaKind } from './types'

export type CountLabel =
  { kind: 'none' } | { kind: 'total'; total: number } | { kind: 'narrowed'; shown: number; total: number }

/** Nothing for an empty library; "<shown> of <total>" only when narrowed; else the total. */
export function countLabel(shown: number, total: number): CountLabel {
  if (total === 0) return { kind: 'none' }
  return shown < total ? { kind: 'narrowed', shown, total } : { kind: 'total', total }
}

export interface ListState {
  filters: Filters
  sort: SortOption
  search: string
}

interface ListView<T> {
  items: T[]
  shown: number
  total: number
  count: CountLabel
  /** True when the library has items but none match (show "list is empty" text). */
  empty: boolean
}

/** Filters, then search on top, then sort; total is the unfiltered list size. */
export function buildView<T extends ListItem>(
  all: readonly T[],
  state: ListState,
  kind: MediaKind,
  locale: string,
): ListView<T> {
  const filtered = applyFilters(all, state.filters, kind)
  const items = sortItems(applySearch(filtered, state.search, locale), state.sort, locale)
  return {
    items,
    shown: items.length,
    total: all.length,
    count: countLabel(items.length, all.length),
    empty: items.length === 0,
  }
}
