import { useState } from 'react'
import type { ApiClient } from '../../api/client'
import type { Locale } from '../../i18n'
import { AddSheet } from './AddSheet'
import { useCreateMovie, useDeleteMovie, useMovies, useUpdateMovie } from './hooks'
import { FilmIcon } from './icons'
import { ListScreen, type ListData, type ListTexts } from './ListScreen'
import { TvRefreshSheet } from './TvRefreshSheet'
import { MovieCard, MovieDetailSheet } from './MovieCard'
import type { Movie } from './types'

const TEXTS: ListTexts = {
  title: 'media.movies.title',
  searchLabel: 'media.movies.search.label',
  emptyTitle: 'media.movies.empty.title',
  emptyPrompt: 'media.movies.empty.prompt',
  emptyAdd: 'media.movies.empty.add',
  seenFilter: 'media.filter.seenMovie',
}

/** Movies and series list, self-contained like `BooksScreen`; the type filter is the segmented control. */
export function MoviesScreen({ locale, userId, api }: { locale: Locale; userId?: string; api?: ApiClient }) {
  const movies = useMovies(api)
  const [menu, setMenu] = useState(false)
  const create = useCreateMovie(api)
  const update = useUpdateMovie(api)
  const remove = useDeleteMovie(api)
  const data: ListData<Movie> = {
    query: movies,
    // mutateAsync, not mutate(vars, callbacks): per-call callbacks are dropped when a later mutate() supersedes this one
    patch: (m, patch, onError) => {
      update.mutateAsync({ id: m.id, patch: { ...patch, version: m.version } }).catch(onError)
    },
    remove: (m, { onSuccess, onError }) => {
      remove.mutateAsync(m.id).then(onSuccess, onError)
    },
  }
  return (
    <>
      <ListScreen
        kind="movie"
        locale={locale}
        userId={userId}
        api={api}
        data={data}
        texts={TEXTS}
        renderAdd={(ctx) => (
          <AddSheet
            kind="movie"
            locale={locale}
            items={movies.data ?? []}
            create={(req, h) => void create.mutateAsync(req).then(h.onSuccess, h.onError)}
            api={api}
            {...ctx}
          />
        )}
        onMenu={() => setMenu(true)}
        emptyIcon={<FilmIcon size={48} />}
        renderCard={(m, actions) => <MovieCard key={m.id} movie={m} locale={locale} actions={actions} />}
        renderDetail={(m, actions, onClose) => (
          <MovieDetailSheet movie={m} locale={locale} actions={actions} onClose={onClose} />
        )}
      />
      {menu && <TvRefreshSheet locale={locale} movies={movies.data ?? []} onClose={() => setMenu(false)} api={api} />}
    </>
  )
}
