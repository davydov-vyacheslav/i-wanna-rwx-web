import type { TriState } from '../media/filters'
import type { ReminderItem } from './types'
import { urgencyOf } from './urgency'

/** Expiring soon (critical or soon, 0..14 days): all = Any, include = Only, exclude = Hide. */
export type ExpiringFilter = TriState

export const DEFAULT_EXPIRING: ExpiringFilter = 'all'

/** Filter button badge: 1 when the filter is not Any. Reset is `DEFAULT_EXPIRING`. */
export function activeCount(filter: ExpiringFilter): number {
  return filter === 'all' ? 0 : 1
}

export function applyExpiring<T extends ReminderItem>(items: readonly T[], filter: ExpiringFilter, today: string): T[] {
  if (filter === 'all') return [...items]
  return items.filter((item) => {
    const { kind } = urgencyOf(item, today)
    return (kind === 'critical' || kind === 'soon') === (filter === 'include')
  })
}
