import type { ApiClient } from '../../api/client'
import { Sheet } from '../../components/Sheet'
import { Spinner } from '../../components/Spinner'
import { t, type Locale } from '../../i18n'
import { useBookDetails, useMovieDetails } from './hooks'
import { CoverLink, YearRating } from './MediaCard'
import { tvLine } from './tvMeta'
import type { MediaKind } from './types'

/**
 * Display-only preview of a provider entry (the server's details for its `sourceUrl`). Add posts the same
 * `{id, sourceUrl}` as tapping the row; a failed preview shows an inline error and Add stays available.
 */
export function PreviewSheet({
  kind,
  sourceUrl,
  title,
  locale,
  canAdd,
  onAdd,
  onClose,
  api,
}: {
  kind: MediaKind
  sourceUrl: string
  title: string
  locale: Locale
  canAdd: boolean
  onAdd: () => void
  onClose: () => void
  api?: ApiClient
}) {
  const book = useBookDetails(kind === 'book' ? sourceUrl : null, api)
  const movie = useMovieDetails(kind === 'movie' ? sourceUrl : null, api)
  const query = kind === 'book' ? book : movie
  const d = query.data
  const b = kind === 'book' ? book.data : undefined
  const m = kind === 'movie' ? movie.data : undefined
  const tv = m ? tvLine(m, locale) : null

  return (
    <Sheet
      title={t(locale, 'media.preview.title')}
      closeLabel={t(locale, 'media.close')}
      onClose={onClose}
      footer={
        canAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="bg-accent text-on-accent text-input min-h-11 w-full rounded-md font-semibold"
          >
            {t(locale, 'media.add')}
          </button>
        )
      }
    >
      <h3 className="text-sheet font-semibold [overflow-wrap:anywhere]">{d?.title ?? title}</h3>
      {query.isPending && (
        <div
          role="status"
          aria-label={t(locale, 'media.preview.loading')}
          className="text-ink-2 flex min-h-11 items-center justify-center"
        >
          <Spinner />
        </div>
      )}
      {query.isError && (
        <p role="alert" className="text-danger text-body mt-2">
          {t(locale, 'media.preview.error')}
        </p>
      )}
      {d && (
        <div className="mt-2 flex gap-3">
          <CoverLink
            title={d.title}
            src={b?.coverUrl ?? m?.posterUrl}
            kind={kind}
            locale={locale}
            width={90}
            height={120}
          />
          <div className="min-w-0 flex-1">
            {b && <p className="text-body text-ink-2">{b.author || t(locale, 'media.noAuthor')}</p>}
            {m?.originalTitle && m.originalTitle !== m.title && (
              <p className="text-body text-ink-2">{m.originalTitle}</p>
            )}
            <YearRating year={d.year} rating={d.rating} locale={locale} />
            {tv && <p className="text-foot text-ink-2">{tv}</p>}
          </div>
        </div>
      )}
      {d && (
        <p className="text-body mt-3 whitespace-pre-line [overflow-wrap:anywhere]">
          {d.description || t(locale, 'media.preview.noDescription')}
        </p>
      )}
    </Sheet>
  )
}
