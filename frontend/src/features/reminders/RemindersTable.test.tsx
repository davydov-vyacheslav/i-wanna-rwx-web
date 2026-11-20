import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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

function mount(onOpen = vi.fn(), onDelete = vi.fn()) {
  render(<RemindersTable rows={ROWS} today="2026-11-20" locale="en" onOpen={onOpen} onDelete={onDelete} />)
  return { onOpen, onDelete }
}
const names = () =>
  within(screen.getAllByRole('rowgroup')[1]!)
    .getAllByRole('row')
    .map((r) => within(r).getAllByRole('button')[0]!.textContent)
const header = (name: string) => screen.getByRole('button', { name })

describe('RemindersTable', () => {
  it('keeps the incoming order until a header is used', () => {
    mount()
    expect(names()).toEqual(['Netflix', 'Adobe', 'Forever'])
    for (const th of screen.getAllByRole('columnheader').slice(0, 4)) expect(th.getAttribute('aria-sort')).toBeNull()
  })

  it('a header sorts ascending, then descending, then restores the default; a missing value stays last', () => {
    mount()
    fireEvent.click(header('Name'))
    expect(names()).toEqual(['Adobe', 'Forever', 'Netflix'])
    expect(screen.getByRole('columnheader', { name: 'Name' }).getAttribute('aria-sort')).toBe('ascending')
    fireEvent.click(header('Name'))
    expect(names()).toEqual(['Netflix', 'Forever', 'Adobe'])
    fireEvent.click(header('Name'))
    expect(names()).toEqual(['Netflix', 'Adobe', 'Forever'])

    fireEvent.click(header('Cost'))
    expect(names()).toEqual(['Netflix', 'Forever', 'Adobe'])
    fireEvent.click(header('Cost'))
    expect(names()).toEqual(['Forever', 'Netflix', 'Adobe'])

    fireEvent.click(header('Expires'))
    fireEvent.click(header('Expires'))
    expect(names()).toEqual(['Adobe', 'Netflix', 'Forever'])
  })

  it('a row opens the item, Delete asks for the delete and does not open', () => {
    const { onOpen, onDelete } = mount()
    fireEvent.click(screen.getByText('Adobe'))
    expect(onOpen).toHaveBeenCalledWith(ROWS[1])
    onOpen.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Netflix' }))
    expect(onDelete).toHaveBeenCalledWith(ROWS[0])
    expect(onOpen).not.toHaveBeenCalled()
  })
})
