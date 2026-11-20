import { describe, expect, it } from 'vitest'
import { cycle } from '../media/filters'
import { activeCount, applyExpiring, DEFAULT_EXPIRING } from './filters'
import { sortReminders } from './sort'
import type { ReminderItem } from './types'
import { daysLeft, todayIn, urgencyOf } from './urgency'

const item = (
  id: string,
  name: string,
  expiryDate: string | null,
  renewalPattern: ReminderItem['renewalPattern'] = 'monthly',
): ReminderItem => ({
  id,
  name,
  expiryDate,
  renewalPattern,
})

const TODAY = '2026-11-20'
const inDays = (n: number) => new Date(Date.parse(TODAY) + n * 86_400_000).toISOString().slice(0, 10)

describe('urgency', () => {
  it.each([
    [-1, { kind: 'expired' }],
    [0, { kind: 'critical', days: 0 }],
    [2, { kind: 'critical', days: 2 }],
    [3, { kind: 'soon', days: 3 }],
    [14, { kind: 'soon', days: 14 }],
    [15, { kind: 'ok' }],
  ])('%i days left', (n, expected) => {
    expect(urgencyOf(item('1', 'x', inDays(n)), TODAY)).toEqual(expected)
  })

  it('lifetime has its own state', () => {
    expect(urgencyOf(item('1', 'x', null, 'lifetime'), TODAY)).toEqual({ kind: 'lifetime' })
  })

  it('counts days across a DST change', () => {
    expect(daysLeft('2026-03-30', '2026-03-28')).toBe(2)
  })

  it('today follows the zone, not the device', () => {
    const now = new Date('2026-11-20T23:30:00Z')
    expect(todayIn('UTC', now)).toBe('2026-11-20')
    expect(todayIn('Pacific/Auckland', now)).toBe('2026-11-21')
    expect(todayIn('America/Los_Angeles', new Date('2026-11-20T03:00:00Z'))).toBe('2026-11-19')
    // the same expiry is critical in one zone and expired in the other
    const expiry = item('1', 'x', '2026-11-20')
    expect(urgencyOf(expiry, todayIn('UTC', now)).kind).toBe('critical')
    expect(urgencyOf(expiry, todayIn('Pacific/Auckland', now)).kind).toBe('expired')
  })
})

describe('sort', () => {
  it('expired, 3 days, 30 days, lifetime', () => {
    const items = [
      item('4', 'D', null, 'lifetime'),
      item('3', 'C', inDays(30)),
      item('2', 'B', inDays(3)),
      item('1', 'A', inDays(-5)),
    ]
    expect(sortReminders(items, 'en').map((i) => i.id)).toEqual(['1', '2', '3', '4'])
  })

  it('ties by name case-insensitively, then id; input untouched', () => {
    const items = [item('b', 'beta', '2026-12-01'), item('c', 'Alpha', '2026-12-01'), item('a', 'alpha', '2026-12-01')]
    expect(sortReminders(items, 'en').map((i) => i.id)).toEqual(['a', 'c', 'b'])
    expect(items.map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('collates ru and uk letters in alphabet order', () => {
    const ru = [
      item('1', 'Яндекс', null, 'lifetime'),
      item('2', 'Ёлка', null, 'lifetime'),
      item('3', 'Арбуз', null, 'lifetime'),
      item('4', 'Жук', null, 'lifetime'),
    ]
    expect(sortReminders(ru, 'ru').map((i) => i.name)).toEqual(['Арбуз', 'Ёлка', 'Жук', 'Яндекс'])
    const uk = [
      item('1', 'Їжак', null, 'lifetime'),
      item('2', 'Іграшка', null, 'lifetime'),
      item('3', 'Ясень', null, 'lifetime'),
      item('4', 'Ето', null, 'lifetime'),
    ]
    expect(sortReminders(uk, 'uk').map((i) => i.name)).toEqual(['Ето', 'Іграшка', 'Їжак', 'Ясень'])
  })
})

describe('expiring filter', () => {
  const items = [
    item('expired', 'a', inDays(-1)),
    item('today', 'b', inDays(0)),
    item('soon', 'c', inDays(14)),
    item('ok', 'd', inDays(15)),
    item('life', 'e', null, 'lifetime'),
  ]
  const ids = (f: Parameters<typeof applyExpiring>[1]) => applyExpiring(items, f, TODAY).map((i) => i.id)

  it('Any keeps everything, Only keeps critical and soon, Hide the rest', () => {
    expect(ids('all')).toEqual(['expired', 'today', 'soon', 'ok', 'life'])
    expect(ids('include')).toEqual(['today', 'soon'])
    expect(ids('exclude')).toEqual(['expired', 'ok', 'life'])
  })

  it('badge count is 1 unless Any; reset is Any; taps cycle', () => {
    expect(activeCount(DEFAULT_EXPIRING)).toBe(0)
    expect(activeCount('include')).toBe(1)
    expect(activeCount('exclude')).toBe(1)
    expect(cycle(cycle(cycle(DEFAULT_EXPIRING)))).toBe(DEFAULT_EXPIRING)
  })
})
