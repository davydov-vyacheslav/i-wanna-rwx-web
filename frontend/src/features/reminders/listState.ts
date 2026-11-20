import { useCallback, useState } from 'react'
import type { ApiClient } from '../../api/client'
import { useMe } from '../identity/useMe'
import { DEFAULT_EXPIRING, type ExpiringFilter } from './filters'
import type { ReminderType } from './types'

export interface RemindersState {
  /** Last chosen segment. */
  segment: ReminderType
  /** Expiring-soon filter per segment. */
  expiring: Record<ReminderType, ExpiringFilter>
}

export function defaultRemindersState(): RemindersState {
  return { segment: 'subscriptions', expiring: { subscriptions: DEFAULT_EXPIRING, licenses: DEFAULT_EXPIRING } }
}

/** Device-local, keyed by user id (never synced). */
export function storageKey(userId: string): string {
  return `rwx.reminders.${userId}`
}

const SEGMENTS: readonly unknown[] = ['subscriptions', 'licenses']
const FILTERS: readonly unknown[] = ['all', 'include', 'exclude']

/** Strict shape check; anything unexpected yields null so the caller falls back to the defaults. */
function parse(raw: string | null): RemindersState | null {
  if (raw === null) return null
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return null
  }
  if (v === null || typeof v !== 'object') return null
  const o = v as { segment?: unknown; expiring?: Record<string, unknown> | null }
  const e = o.expiring
  if (!SEGMENTS.includes(o.segment) || e === null || typeof e !== 'object') return null
  if (!FILTERS.includes(e.subscriptions) || !FILTERS.includes(e.licenses)) return null
  return o as RemindersState
}

export function loadRemindersState(userId: string | undefined): RemindersState {
  if (!userId) return defaultRemindersState()
  try {
    return parse(localStorage.getItem(storageKey(userId))) ?? defaultRemindersState()
  } catch {
    return defaultRemindersState()
  }
}

function saveRemindersState(userId: string | undefined, state: RemindersState): void {
  if (!userId) return
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(state))
  } catch {
    // storage full or blocked: the state just stays in memory
  }
}

/** Last segment and the expiring-soon filter of each segment, persisted per user on this device. */
export function useRemindersState(opts: { userId?: string; api?: ApiClient } = {}) {
  const { me } = useMe(opts.api)
  const userId = opts.userId ?? me?.id
  const [slot, setSlot] = useState(() => ({ userId, state: loadRemindersState(userId) }))
  let state = slot.state
  if (slot.userId !== userId) {
    // user changed: reload (render-phase reset, the documented pattern)
    state = loadRemindersState(userId)
    setSlot({ userId, state })
  }

  const update = useCallback(
    (fn: (s: RemindersState) => RemindersState) => {
      setSlot((prev) => {
        const next = fn(prev.userId === userId ? prev.state : loadRemindersState(userId))
        saveRemindersState(userId, next)
        return { userId, state: next }
      })
    },
    [userId],
  )

  return {
    state,
    setSegment: useCallback((segment: ReminderType) => update((s) => ({ ...s, segment })), [update]),
    setExpiring: useCallback(
      (type: ReminderType, filter: ExpiringFilter) =>
        update((s) => ({ ...s, expiring: { ...s.expiring, [type]: filter } })),
      [update],
    ),
  }
}
