export function normalizeIsbn(isbn: string): string {
  return isbn.replace(/[\s-]/g, '').toUpperCase()
}

/** Client twin of the server's `TitleKey.of` (NFC, trim, lower-case, NFC); shared vectors keep them equal. */
export function titleKey(text: string): string {
  return text.normalize('NFC').trim().toLowerCase().normalize('NFC')
}

/** The part of a library item the add sheet's in-library rules read. */
export interface LibraryItem {
  id: string
  title: string
  originalTitle?: string
  isbn?: string
  externalLink: string
}

/** The item whose stored `externalLink` equals a search entry's `sourceUrl` (plain string equality; the server builds both). */
export function findByLink<T extends LibraryItem>(sourceUrl: string, items: readonly T[]): T | undefined {
  return items.find((i) => i.externalLink === sourceUrl)
}

/** The item with the same normalized ISBN (a book hit that carries `isbn`); undefined for a blank ISBN. */
export function findByIsbn<T extends LibraryItem>(isbn: string | undefined, items: readonly T[]): T | undefined {
  const key = isbn ? normalizeIsbn(isbn) : ''
  if (!key) return undefined
  return items.find((i) => i.isbn && normalizeIsbn(i.isbn) === key)
}

/**
 * The item whose title (movies: or original title) has the same title key as `text`, or undefined. When one
 * exists the draft entry is not offered at all. A blank text matches nothing.
 */
export function titleInLibrary<T extends LibraryItem>(text: string, items: readonly T[]): T | undefined {
  const key = titleKey(text)
  if (!key) return undefined
  return items.find((i) => titleKey(i.title) === key || (!!i.originalTitle && titleKey(i.originalTitle) === key))
}
