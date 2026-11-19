import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BooksScreen } from './BooksScreen'
import { fake, renderList } from './listTestUtils'
import type { Book } from './types'

const dialog = () => screen.getByRole('alertdialog')
const confirmBtn = () => within(dialog()).getByRole('button', { name: 'Delete' })
const cancelBtn = () => within(dialog()).getByRole('button', { name: 'Cancel' })
const deletes = (calls: { method: string }[]) => calls.filter((c) => c.method === 'DELETE')

describe('delete confirmation', () => {
  it('names the item and says it cannot be undone; Cancel has focus', async () => {
    renderList(BooksScreen, [fake<Book>({ title: 'Dune' })])
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Dune' }))
    expect(within(dialog()).getByText('Delete this item?')).toBeTruthy()
    expect(within(dialog()).getByText('“Dune” will be deleted. This cannot be undone.')).toBeTruthy()
    expect(document.activeElement).toBe(cancelBtn())
  })

  it('card: Cancel sends nothing and keeps the row', async () => {
    const { calls } = renderList(BooksScreen, [fake<Book>({ title: 'Dune' })])
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Dune' }))
    fireEvent.click(cancelBtn())
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByText('Dune')).toBeTruthy()
    expect(deletes(calls)).toHaveLength(0)
  })

  it('card: Cancel snaps the swiped card back to rest', async () => {
    renderList(BooksScreen, [fake<Book>({ title: 'Dune' })])
    const del = await screen.findByRole('button', { name: 'Delete Dune' })
    const card = del.closest('[data-swipe]') as HTMLElement
    card.scrollLeft = 96 // swiped open
    fireEvent.click(del)
    fireEvent.click(cancelBtn())
    expect(card.scrollLeft).toBe(0)
  })

  it('card: confirm sends one DELETE and removes the row', async () => {
    const b = fake<Book>({ title: 'Dune' })
    const { calls } = renderList(BooksScreen, [b, fake<Book>({ title: 'Emma' })])
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Dune' }))
    fireEvent.click(confirmBtn())
    await waitFor(() => expect(screen.queryByText('Dune')).toBeNull())
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(deletes(calls)).toHaveLength(1)
    expect(deletes(calls)[0]).toMatchObject({ path: `/api/v1/books/${b.id}` })
  })

  it('detail: Cancel keeps the sheet, confirm closes both', async () => {
    const { calls } = renderList(BooksScreen, [fake<Book>({ title: 'Alien' })])
    fireEvent.click(await screen.findByText('Alien'))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    fireEvent.click(cancelBtn())
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(deletes(calls)).toHaveLength(0)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    fireEvent.click(confirmBtn())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(deletes(calls)).toHaveLength(1)
  })

  it('a failed delete keeps the row and shows the toast', async () => {
    renderList(BooksScreen, [fake<Book>({ title: 'Dune' })], 'en', (req) =>
      req.method === 'DELETE'
        ? new Response(JSON.stringify({ code: 'oops' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        : undefined,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Dune' }))
    fireEvent.click(confirmBtn())
    expect((await screen.findByRole('alert')).textContent).toContain('Something went wrong')
    expect(screen.getByText('Dune')).toBeTruthy()
  })

  it('ru texts', async () => {
    renderList(BooksScreen, [fake<Book>({ title: 'Дюна' })], 'ru')
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить: Дюна' }))
    expect(within(dialog()).getByText('«Дюна» будет удалено. Это действие нельзя отменить.')).toBeTruthy()
    expect(within(dialog()).getByRole('button', { name: 'Отмена' })).toBeTruthy()
  })
})
