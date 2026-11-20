import type { ReminderItem } from './types'

/**
 * Expiry soonest first (expired therefore first), lifetime last, then name (locale-aware,
 * case-insensitive), then id. Does not mutate the input.
 */
export function sortReminders<T extends ReminderItem>(items: readonly T[], locale: string): T[] {
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true })
  // ISO dates compare correctly as strings; a missing date (lifetime) sorts after every date.
  const byExpiry = (a: T, b: T) =>
    a.expiryDate === b.expiryDate
      ? 0
      : a.expiryDate === null
        ? 1
        : b.expiryDate === null
          ? -1
          : a.expiryDate < b.expiryDate
            ? -1
            : 1
  return [...items].sort(
    (a, b) => byExpiry(a, b) || collator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
}
