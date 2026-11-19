import type { ListItem } from './types'

function fold(s: string, locale: string): string {
  // only e/yo is folded (ru/uk users type "елка" for "Ёлка"); other diacritics stay distinct
  return s.normalize('NFC').toLocaleLowerCase(locale).replaceAll('ё', 'е')
}

/** Case-insensitive, locale-aware substring match on the title only. Blank query matches all. */
export function matchesSearch(title: string, query: string, locale: string): boolean {
  const q = fold(query.trim(), locale)
  return q === '' || fold(title, locale).includes(q)
}

export function applySearch<T extends ListItem>(items: readonly T[], query: string, locale: string): T[] {
  return items.filter((i) => matchesSearch(i.title, query, locale))
}
