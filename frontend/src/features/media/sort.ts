import type { ListItem } from './types'

export type SortOption = 'titleAsc' | 'updatedDesc'

export const DEFAULT_SORT: SortOption = 'titleAsc'

/** Does not mutate the input. titleAsc: locale-aware, case-insensitive, numeric-aware, ties by id. */
export function sortItems<T extends ListItem>(items: readonly T[], sort: SortOption, locale: string): T[] {
  const out = [...items]
  if (sort === 'updatedDesc') {
    return out.sort((a, b) => {
      const d = Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
      return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
  }
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true })
  return out.sort((a, b) => collator.compare(a.title, b.title) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
