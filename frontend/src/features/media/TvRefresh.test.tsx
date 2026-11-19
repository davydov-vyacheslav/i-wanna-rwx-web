import { StrictMode } from 'react'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { fake, renderList } from './listTestUtils'
import { MoviesScreen } from './MoviesScreen'
import type { Movie } from './types'
import { json } from '../../test/fixtures'

beforeEach(() => localStorage.clear())

const TV = 'https://www.themoviedb.org/tv/'
const series = (n: number, o: Partial<Movie> = {}) =>
  fake<Movie>({
    type: 'tv',
    title: `Series ${n}`,
    source: 'tmdb',
    externalId: `tv-${n}`,
    externalLink: `${TV}${n}`,
    tvStatus: 'ongoing',
    seasonCount: 2,
    ...o,
  })
const sources = {
  books: [],
  movies: [
    {
      id: 'tmdb',
      label: 'TMDb',
      requiresKey: true,
      isDefault: true,
      isEffective: true,
      available: true,
      tokenSaved: true,
    },
  ],
}

/** Renders the movies list with a fake TMDb details endpoint; `details(n)` answers for series number n. */
function setup(items: Movie[], details: (n: number, call: number) => Response, strict = false) {
  const detailCalls: string[] = []
  const counts = new Map<number, number>()
  const Screen: typeof MoviesScreen = strict
    ? (p) => (
        <StrictMode>
          <MoviesScreen {...p} />
        </StrictMode>
      )
    : MoviesScreen
  const view = renderList(Screen, items, 'en', (req) => {
    const url = new URL(req.url)
    if (url.pathname === '/api/v1/data-sources') return json(sources)
    if (url.pathname !== '/api/v1/search/movies/details') return undefined
    const link = url.searchParams.get('sourceUrl')!
    detailCalls.push(link)
    const n = Number(link.slice(TV.length))
    counts.set(n, (counts.get(n) ?? 0) + 1)
    return details(n, counts.get(n)!)
  })
  const writes = () => view.calls.filter((c) => c.method === 'PATCH')
  return { ...view, detailCalls, writes }
}
const detail = (o: Record<string, unknown> = {}) => ({
  type: 'tv',
  title: 't',
  externalLink: TV + '1',
  tvStatus: 'ongoing',
  seasonCount: 2,
  ...o,
})

async function refresh() {
  fireEvent.click(await screen.findByRole('button', { name: 'More' }))
  const dialog = screen.getByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: /Refresh series status/ }))
  return dialog
}

describe('TV refresh', () => {
  it('runs under StrictMode (the unmount probe must not leave the run stopped)', async () => {
    const { detailCalls } = setup([series(1)], () => json(detail()), true)
    await screen.findByText('Series 1')
    const dialog = await refresh()
    expect(await within(dialog).findByText('Series checked: 1. Updated: 0.')).toBeTruthy()
    expect(detailCalls).toEqual([TV + '1'])
  })

  it('unchanged: no write; drafts and movies are not requested', async () => {
    const draft = fake<Movie>({ type: 'tv', title: 'Draft series' })
    const { detailCalls, writes } = setup(
      [series(1), draft, fake<Movie>({ type: 'movie', title: 'A movie', source: 'tmdb' })],
      () => json(detail()),
    )
    await screen.findByText('Series 1')
    const dialog = await refresh()
    expect(await within(dialog).findByText('Series checked: 1. Updated: 0.')).toBeTruthy()
    expect(detailCalls).toEqual([TV + '1'])
    expect(writes()).toHaveLength(0)
  })

  it('ongoing -> ended: one PATCH with the new values; a null status is ignored', async () => {
    const { writes } = setup([series(1), series(2)], (n) =>
      json(detail(n === 1 ? { tvStatus: 'ended', seasonCount: 3 } : { tvStatus: undefined, seasonCount: 9 })),
    )
    await screen.findByText('Series 1')
    const dialog = await refresh()
    expect(await within(dialog).findByText('Series checked: 2. Updated: 1.')).toBeTruthy()
    expect(writes()).toHaveLength(1)
    expect(writes()[0]!.body).toMatchObject({ tvStatus: 'ended', seasonCount: 3 })
  })

  it('a 400 validation on sourceUrl skips that series; the run continues', async () => {
    const bad = { status: 400, code: 'validation', errors: [{ field: 'sourceUrl', message: 'unsupported' }] }
    const { detailCalls } = setup([series(1), series(2)], (n) => (n === 1 ? json(bad, 400) : json(detail())))
    await screen.findByText('Series 1')
    const dialog = await refresh()
    expect(await within(dialog).findByText('Series checked: 1. Updated: 0.')).toBeTruthy()
    expect(detailCalls).toEqual([TV + '1', TV + '2'])
  })

  it('a 400 validation without a sourceUrl field stops the run', async () => {
    const { detailCalls } = setup([series(1), series(2)], () =>
      json({ status: 400, code: 'validation', errors: [{ field: 'q', message: 'bad' }] }, 400),
    )
    await screen.findByText('Series 1')
    const dialog = await refresh()
    expect(await within(dialog).findByText(/The refresh stopped/)).toBeTruthy()
    expect(detailCalls).toEqual([TV + '1'])
  })

  it('429 backs off and retries the same series once', async () => {
    const { detailCalls, writes } = setup([series(1)], (_n, call) =>
      call === 1
        ? json({ status: 429, code: 'rate_limited' }, 429, { 'Retry-After': '0' })
        : json(detail({ tvStatus: 'ended' })),
    )
    await screen.findByText('Series 1')
    const dialog = await refresh()
    expect(await within(dialog).findByText('Series checked: 1. Updated: 1.')).toBeTruthy()
    expect(detailCalls).toEqual([TV + '1', TV + '1'])
    expect(writes()).toHaveLength(1)
  })

  it('503 provider_rate_limited backs off with Retry-After and retries the same series once', async () => {
    const { detailCalls, writes } = setup([series(1)], (_n, call) =>
      call === 1
        ? json({ status: 503, code: 'provider_rate_limited' }, 503, { 'Retry-After': '0' })
        : json(detail({ tvStatus: 'ended' })),
    )
    await screen.findByText('Series 1')
    const dialog = await refresh()
    expect(await within(dialog).findByText('Series checked: 1. Updated: 1.')).toBeTruthy()
    expect(detailCalls).toEqual([TV + '1', TV + '1'])
    expect(writes()).toHaveLength(1)
  })

  it('a second rate limit for the same series stops the run, in refresh wording', async () => {
    const { detailCalls } = setup([series(1), series(2)], () =>
      json({ status: 429, code: 'rate_limited' }, 429, { 'Retry-After': '0' }),
    )
    await screen.findByText('Series 1')
    const dialog = await refresh()
    const alert = await within(dialog).findByRole('alert')
    expect(alert.textContent).toBe('Too many requests. The refresh stopped; try again in a moment.')
    expect(detailCalls).toEqual([TV + '1', TV + '1'])
  })

  it.each([
    [502, 'provider_error', 'TMDb is unavailable. The refresh stopped; try again.'],
    [504, 'provider_timeout', 'TMDb took too long. The refresh stopped; try again.'],
    [500, 'x', 'Something went wrong. The refresh stopped; try again.'],
  ])('%s %s stops the run with a message that fits a refresh, inside the sheet', async (status, code, text) => {
    setup([series(1)], () => json({ status, code, source: 'tmdb' }, status))
    await screen.findByText('Series 1')
    const dialog = await refresh()
    const alert = await within(dialog).findByRole('alert')
    expect(alert.textContent).toBe(text)
    expect(alert.textContent).not.toContain('added')
  })

  it('source_key_missing offers Open Settings, which closes the sheet first', async () => {
    setup([series(1)], () => json({ status: 409, code: 'source_key_missing', source: 'tmdb' }, 409))
    await screen.findByText('Series 1')
    const dialog = await refresh()
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Open Settings' }))
    expect(window.location.hash).toBe('#/settings')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('source_key_invalid stops the run with a toast naming the source', async () => {
    const { detailCalls } = setup([series(1), series(2)], () =>
      json({ status: 409, code: 'source_key_invalid', source: 'tmdb' }, 409),
    )
    await screen.findByText('Series 1')
    await refresh()
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('TMDb'))
    expect(screen.getByRole('dialog').contains(screen.getByRole('alert'))).toBe(true)
    expect(detailCalls).toEqual([TV + '1'])
  })
})
