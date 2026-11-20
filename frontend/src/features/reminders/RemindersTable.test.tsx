import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RemindersTable } from './RemindersTable'
import type { Subscription } from './types'

const sub = (over: Partial<Subscription>): Subscription => ({
  id: over.name ?? 'x',
  userId: 'u1',
  name: 'x',
  expiryDate: '2030-03-15',
  renewalPattern: 'monthly',
  remindDays: 3,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
})

const ROWS = [
  sub({ name: 'Netflix', expiryDate: '2030-01-10', cost: '15 USD' }),
  sub({ name: 'Adobe', expiryDate: '2030-06-01', renewalPattern: 'yearly' }),
  sub({ name: 'Forever', expiryDate: null, renewalPattern: 'lifetime', cost: '99 USD' }),
]

describe('RemindersTable', () => {
  it('has Name, Expires, Renewal and Cost columns; Renewal and Cost are hidden below lg', () => {
    render(<RemindersTable rows={ROWS} today="2026-11-20" locale="en" onOpen={() => {}} onDelete={() => {}} />)
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Name',
      'Expires',
      'Renewal',
      'Cost',
      'Delete',
    ])
    for (const name of ['Renewal', 'Cost'])
      expect(screen.getByRole('columnheader', { name }).className).toContain('hidden lg:table-cell')
  })

  it('sorts Expires soonest first with a lifetime item last, and Cost by value', () => {
    render(<RemindersTable rows={ROWS} today="2026-11-20" locale="en" onOpen={() => {}} onDelete={() => {}} />)
    const names = () =>
      within(screen.getAllByRole('rowgroup')[1]!)
        .getAllByRole('row')
        .map((r) => within(r).getAllByRole('button')[0]!.textContent)
    fireEvent.click(screen.getByRole('button', { name: 'Expires' }))
    expect(names()).toEqual(['Netflix', 'Adobe', 'Forever'])
    fireEvent.click(screen.getByRole('button', { name: 'Expires' }))
    expect(names()).toEqual(['Adobe', 'Netflix', 'Forever'])
    fireEvent.click(screen.getByRole('button', { name: 'Cost' }))
    expect(names()).toEqual(['Netflix', 'Forever', 'Adobe'])
  })

  it('is fixed-layout with one width class per column, so every tab renders the same columns', () => {
    render(<RemindersTable rows={ROWS} today="2026-11-20" locale="en" onOpen={() => {}} onDelete={() => {}} />)
    expect(screen.getByRole('table').className).toContain('table-fixed')
    const widths = screen.getAllByRole('columnheader').map((h) => h.className.match(/\bw-[\w.]+/)?.[0])
    expect(widths).toEqual([undefined, 'w-64', 'w-36', 'w-28', 'w-14'])
  })
})
