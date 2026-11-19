import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { defaultFilters } from './filters'
import { storageKey } from './listState'
import { MoviesScreen } from './MoviesScreen'
import { fake, renderList, USER } from './listTestUtils'
import { tvLine } from './tvMeta'
import type { Movie } from './types'

const movie = (o: Partial<Movie> = {}) => fake<Movie>({ type: 'movie', ...o })
const tv = (o: Partial<Movie> = {}) => fake<Movie>({ type: 'tv', ...o })
const row = (name: string) => screen.getByRole('checkbox', { name: new RegExp(name) })

beforeEach(() => localStorage.clear())

describe('tvLine', () => {
  it.each([
    [{ type: 'tv', tvStatus: 'ended', seasonCount: 3 }, 'en', 'Status: Ended • 3 seasons'],
    [{ type: 'tv', tvStatus: 'ongoing', seasonCount: 1 }, 'en', 'Status: Ongoing • 1 season'],
    [{ type: 'tv', tvStatus: 'ongoing' }, 'en', 'Status: Ongoing'],
    [{ type: 'tv', seasonCount: 2 }, 'en', '2 seasons'],
    [{ type: 'tv' }, 'en', null],
    [{ type: 'movie', tvStatus: 'ended', seasonCount: 3 }, 'en', null],
    [{ type: 'tv', tvStatus: 'ended', seasonCount: 5 }, 'ru', 'Статус: Завершён • сезонов: 5'],
    [{ type: 'tv', tvStatus: 'ongoing', seasonCount: 21 }, 'uk', 'Статус: Триває • сезонів: 21'],
  ] as const)('%j in %s -> %s', (m, locale, expected) => {
    expect(tvLine(m, locale)).toBe(expected)
  })
})

describe('MoviesScreen', () => {
  it('card: TV meta line, no author line, type icon, TMDb badge, cover link to tv page', async () => {
    renderList(MoviesScreen, [
      tv({
        title: 'Breaking Bad',
        source: 'tmdb',
        externalId: '1396',
        externalLink: 'https://www.themoviedb.org/tv/1396',
        tvStatus: 'ended',
        seasonCount: 5,
        year: 2008,
        rating: 8.9,
      }),
      movie({ title: 'Alien' }),
    ])
    const card = (await screen.findByText('Breaking Bad')).closest('li')!
    expect(within(card).getByText('Status: Ended • 5 seasons')).toBeTruthy()
    expect(within(card).getByText('TMDb')).toBeTruthy()
    expect(within(card).getByText('8.9')).toBeTruthy()
    expect(within(card).queryByText('No author')).toBeNull()
    expect(within(card).getByRole('link').getAttribute('href')).toBe('https://www.themoviedb.org/tv/1396')
    const plain = screen.getByText('Alien').closest('li')!
    expect(within(plain).queryByText(/Status:/)).toBeNull()
    expect(within(plain).getByText('Draft')).toBeTruthy()
  })

  it('type segments filter the list; tapping the selected one returns to all', async () => {
    renderList(MoviesScreen, [movie({ title: 'Alien' }), tv({ title: 'Lost' })])
    await screen.findByText('Alien')
    const group = screen.getByRole('group', { name: 'Type' })
    fireEvent.click(within(group).getByRole('button', { name: 'Series' }))
    expect(screen.queryByText('Alien')).toBeNull()
    expect(screen.getByText('Lost')).toBeTruthy()
    expect(screen.getByText('1 of 2')).toBeTruthy()
    expect(within(group).getByRole('button', { name: 'Series' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(group).getByRole('button', { name: 'Series' }))
    expect(screen.getByText('Alien')).toBeTruthy()
    fireEvent.click(within(group).getByRole('button', { name: 'Movies' }))
    expect(screen.queryByText('Lost')).toBeNull()
    fireEvent.click(within(group).getByRole('button', { name: 'All' }))
    expect(screen.getByText('Lost')).toBeTruthy()
  })

  it.each([
    ['ru', 'Сериалы'],
    ['uk', 'Серіали'],
  ] as const)('the series segment uses the plural label in %s', async (locale, label) => {
    renderList(MoviesScreen, [movie({ title: 'Alien' }), tv({ title: 'Lost' })], locale)
    const group = await screen.findByRole('group')
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toContain(label)
  })

  it('segments are hidden when only one type exists and no type is selected', async () => {
    renderList(MoviesScreen, [movie({ title: 'Alien' })])
    await screen.findByText('Alien')
    expect(screen.queryByRole('group', { name: 'Type' })).toBeNull()
  })

  it('Ended filter is in the sheet only for series; leaving series resets it', async () => {
    renderList(MoviesScreen, [
      tv({ title: 'Lost', tvStatus: 'ended' }),
      tv({ title: 'Severance', tvStatus: 'ongoing' }),
      movie({ title: 'Alien' }),
    ])
    await screen.findByText('Alien')
    const group = screen.getByRole('group', { name: 'Type' })
    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }))
    expect(screen.queryByRole('checkbox', { name: /Ended/ })).toBeNull()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done' }))

    fireEvent.click(within(group).getByRole('button', { name: 'Series' }))
    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }))
    fireEvent.click(row('Ended')) // Only
    expect(screen.queryByText('Severance')).toBeNull()
    expect(screen.getByText('Lost')).toBeTruthy()
    expect(row('Ended').getAttribute('aria-checked')).toBe('true')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done' }))

    fireEvent.click(within(group).getByRole('button', { name: 'Movies' }))
    const saved = JSON.parse(localStorage.getItem(storageKey('movies', USER))!)
    expect(saved.filters).toMatchObject({ type: 'movie', ended: 'all' })
    fireEvent.click(within(group).getByRole('button', { name: 'Series' }))
    expect(screen.getByText('Severance')).toBeTruthy()
  })

  it('badge counts type + ended on top of the default', async () => {
    renderList(MoviesScreen, [movie({ title: 'Alien' }), tv({ title: 'Lost' })])
    await screen.findByText('Alien')
    // the list is aria-hidden while its sheet is open
    const open = () => screen.getByRole('button', { name: /^Filters/, hidden: true })
    expect(open().textContent).toBe('1')
    fireEvent.click(within(screen.getByRole('group', { name: 'Type' })).getByRole('button', { name: 'Series' }))
    expect(open().textContent).toBe('2')
    fireEvent.click(open())
    fireEvent.click(row('Ended'))
    expect(open().textContent).toBe('3')
  })

  it('toggles PATCH the movie endpoint with movie wording', async () => {
    const m = movie({ title: 'Alien' })
    const { calls } = renderList(MoviesScreen, [m])
    await screen.findByText('Alien')
    fireEvent.click(screen.getByRole('button', { name: 'Favorite' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeTruthy())
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({
      path: `/api/v1/movies/${m.id}`,
      body: { isFavorite: true, version: 1 },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Mark as watched' }))
    await waitFor(() => expect(screen.queryByText('Alien')).toBeNull())
    expect(screen.getByText('0 of 1')).toBeTruthy()
    expect(calls.filter((c) => c.method === 'PATCH')[1]!.body).toEqual({ status: 'seen', version: 2 })
  })

  it('detail sheet shows original title and description; delete closes it', async () => {
    const m = movie({ title: 'Parasite', originalTitle: 'Gisaengchung', description: 'Class.' })
    const { calls } = renderList(MoviesScreen, [m])
    fireEvent.click(await screen.findByText('Parasite'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Gisaengchung')).toBeTruthy()
    expect(within(dialog).getByText('Class.')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(calls.some((c) => c.method === 'DELETE' && c.path === `/api/v1/movies/${m.id}`)).toBe(true)
    expect(await screen.findByText('No movies or series yet')).toBeTruthy()
  })

  it('empty library shows the movies prompt', async () => {
    renderList(MoviesScreen, [])
    expect(await screen.findByText('No movies or series yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add a movie or series' })).toBeTruthy()
  })

  it('persisted type=tv keeps the segments even if no series remain', async () => {
    localStorage.setItem(
      storageKey('movies', USER),
      JSON.stringify({ filters: { ...defaultFilters(), type: 'tv' }, sort: 'titleAsc', search: '' }),
    )
    renderList(MoviesScreen, [movie({ title: 'Alien' })])
    expect(await screen.findByText('Nothing matches')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Type' })).toBeTruthy()
  })
})
