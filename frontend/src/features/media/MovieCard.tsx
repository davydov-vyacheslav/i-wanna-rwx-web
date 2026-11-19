import { type Locale } from '../../i18n'
import { FilmIcon, TvIcon } from './icons'
import { CoverLink, MediaCard, MediaDetailSheet, YearRating, type ItemActions, type MediaLabels } from './MediaCard'
import { coverTapUrl } from './sourceUrl'
import { tvLine } from './tvMeta'
import type { Movie } from './types'

type MovieActions = ItemActions<Movie>

const MOVIE_LABELS: MediaLabels = {
  seen: 'media.movies.status.seen',
  markSeen: 'media.movies.markSeen',
  markPlanned: 'media.movies.markPlanned',
}

function TypeIcon({ type, size }: { type: Movie['type']; size?: number }) {
  return type === 'tv' ? <TvIcon size={size} /> : <FilmIcon size={size} />
}

function MovieCover({ movie, locale, width, height }: { movie: Movie; locale: Locale; width: number; height: number }) {
  return (
    <CoverLink
      href={coverTapUrl(movie)}
      title={movie.title}
      src={movie.posterUrl}
      placeholder={<TypeIcon type={movie.type} size={32} />}
      locale={locale}
      width={width}
      height={height}
    />
  )
}

/** Year, rating and, for series, the status/seasons line. Movies have no author or director. */
function MovieMeta({ movie, locale }: { movie: Movie; locale: Locale }) {
  const tv = tvLine(movie, locale)
  return (
    <>
      <YearRating year={movie.year} rating={movie.rating} locale={locale} />
      {tv && <p className="text-foot text-ink-2 line-clamp-2">{tv}</p>}
    </>
  )
}

export function MovieCard({ movie, locale, actions }: { movie: Movie; locale: Locale; actions: MovieActions }) {
  return (
    <MediaCard
      item={movie}
      locale={locale}
      actions={actions}
      labels={MOVIE_LABELS}
      cover={<MovieCover movie={movie} locale={locale} width={80} height={108} />}
      typeIcon={<TypeIcon type={movie.type} size={16} />}
      meta={<MovieMeta movie={movie} locale={locale} />}
    />
  )
}

export function MovieDetailSheet({
  movie,
  locale,
  actions,
  onClose,
}: {
  movie: Movie
  locale: Locale
  actions: Omit<MovieActions, 'onOpen'>
  onClose: () => void
}) {
  return (
    <MediaDetailSheet
      item={movie}
      locale={locale}
      actions={actions}
      labels={MOVIE_LABELS}
      cover={<MovieCover movie={movie} locale={locale} width={104} height={140} />}
      meta={<MovieMeta movie={movie} locale={locale} />}
      subtitle={movie.originalTitle && movie.originalTitle !== movie.title ? movie.originalTitle : undefined}
      description={movie.description}
      sourceHref={coverTapUrl(movie)}
      onClose={onClose}
    />
  )
}
