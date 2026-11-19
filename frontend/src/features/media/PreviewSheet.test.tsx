import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from '../../api/client'
import type { Locale } from '../../i18n'
import { PreviewSheet } from './PreviewSheet'
import { json } from '../../test/fixtures'

const OL = 'https://openlibrary.org/works/OL45804W'
const TV = 'https://www.themoviedb.org/tv/1396'

function setup({
  kind = 'book',
  canAdd = true,
  locale = 'en',
  reply,
}: {
  kind?: 'book' | 'movie'
  canAdd?: boolean
  locale?: Locale
  reply: () => Response
}) {
  const urls: string[] = []
  const fetchFn: typeof fetch = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init)
    urls.push(req.url)
    return reply()
  }
  const api = createApiClient({ baseUrl: 'http://localhost', fetch: fetchFn, csrfToken: () => 'tok' })
  const onAdd = vi.fn()
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PreviewSheet
        kind={kind}
        sourceUrl={kind === 'book' ? OL : TV}
        title="Dune"
        locale={locale}
        canAdd={canAdd}
        onAdd={onAdd}
        onClose={onClose}
        api={api}
      />
    </QueryClientProvider>,
  )
  return { urls, onAdd, onClose }
}
const book = {
  title: 'Dune (server)',
  author: 'Frank Herbert',
  description: 'Spice and sand.',
  year: 1965,
  rating: 4.3,
  externalLink: OL,
}

describe('PreviewSheet', () => {
  it('asks the server for the sourceUrl and shows the details', async () => {
    const { urls } = setup({ reply: () => json(book) })
    expect(screen.getByRole('status', { name: 'Loading details' })).toBeTruthy()
    expect(await screen.findByText('Spice and sand.')).toBeTruthy()
    expect(screen.getByText('Dune (server)')).toBeTruthy()
    expect(screen.getByText('Frank Herbert')).toBeTruthy()
    expect(new URL(urls[0]!).searchParams.get('sourceUrl')).toBe(OL)
  })

  it('series: the TV line shows seasons and status', async () => {
    setup({
      kind: 'movie',
      reply: () =>
        json({
          type: 'tv',
          title: 'Breaking Bad',
          externalLink: TV,
          description: 'Chemistry.',
          tvStatus: 'ended',
          seasonCount: 5,
        }),
    })
    expect(await screen.findByText('Status: Ended • 5 seasons')).toBeTruthy()
  })

  it('Add is pinned below the scrolling content, so a long description never pushes it away', async () => {
    const { onAdd } = setup({ reply: () => json({ ...book, description: 'Long. '.repeat(500) }) })
    await screen.findByText(/^Long\./)
    const add = screen.getByRole('button', { name: 'Add' })
    const scroller = screen.getByText(/^Long\./).closest('.overflow-y-auto')!
    expect(scroller.contains(add)).toBe(false)
    expect(scroller.parentElement!.contains(add)).toBe(true)
    fireEvent.click(add)
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('no Add while the entry cannot be added (another add pending, or its cooldown)', async () => {
    setup({ canAdd: false, reply: () => json(book) })
    await screen.findByText('Spice and sand.')
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull()
  })

  it('a failed preview shows an inline error and Add stays available', async () => {
    const { onAdd } = setup({ reply: () => json({ status: 502, code: 'provider_error' }, 502) })
    expect((await screen.findByRole('alert')).textContent).toContain('Details are not available')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).toHaveBeenCalled()
  })

  it('Close calls onClose; ru texts', async () => {
    const { onClose } = setup({ locale: 'ru', reply: () => json(book) })
    const dialog = screen.getByRole('dialog', { name: 'Подробности' })
    await screen.findByText('Spice and sand.')
    expect(within(dialog).getByRole('button', { name: 'Добавить' })).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Закрыть' }))
    expect(onClose).toHaveBeenCalled()
  })
})
