import type { ReminderItem } from './types'

export type Urgency =
  { kind: 'lifetime' } | { kind: 'expired' } | { kind: 'critical' | 'soon'; days: number } | { kind: 'ok' }

/** `YYYY-MM-DD` of the instant in the user's IANA zone (en-CA formats dates as ISO). */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now)
}

const DAY_MS = 86_400_000

/** Whole days from `today` to `expiry`, both `YYYY-MM-DD`; UTC arithmetic so no DST shift. */
export function daysLeft(expiry: string, today: string): number {
  return Math.round((Date.parse(expiry) - Date.parse(today)) / DAY_MS)
}

/** Expiry today is 0 days: critical, not expired. 15 or more days: `ok`, no badge. */
export function urgencyOf(item: ReminderItem, today: string): Urgency {
  if (item.renewalPattern === 'lifetime' || item.expiryDate === null) return { kind: 'lifetime' }
  const days = daysLeft(item.expiryDate, today)
  if (days < 0) return { kind: 'expired' }
  if (days < 3) return { kind: 'critical', days }
  if (days <= 14) return { kind: 'soon', days }
  return { kind: 'ok' }
}
