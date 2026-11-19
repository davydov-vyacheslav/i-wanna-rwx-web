import { t, type Locale } from '../../i18n'
import { BookIcon } from './icons'
import { CoverLink, MediaCard, MediaDetailSheet, YearRating, type ItemActions, type MediaLabels } from './MediaCard'
import { coverTapUrl } from './sourceUrl'
import type { Book } from './types'

export { formatRating } from './MediaCard'

type BookActions = ItemActions<Book>

const BOOK_LABELS: MediaLabels = {
  seen: 'media.status.seen',
  markSeen: 'media.markSeen',
  markPlanned: 'media.markPlanned',
}

function BookCover({ book, locale, width, height }: { book: Book; locale: Locale; width: number; height: number }) {
  return (
    <CoverLink
      href={coverTapUrl(book)}
      title={book.title}
      src={book.coverUrl}
      placeholder={<BookIcon size={32} />}
      locale={locale}
      width={width}
      height={height}
    />
  )
}

function BookMeta({ book, locale }: { book: Book; locale: Locale }) {
  return (
    <>
      <YearRating year={book.year} rating={book.rating} locale={locale} />
      <p className="text-foot text-ink-2 line-clamp-1">{book.author || t(locale, 'media.noAuthor')}</p>
    </>
  )
}

export function BookCard({ book, locale, actions }: { book: Book; locale: Locale; actions: BookActions }) {
  return (
    <MediaCard
      item={book}
      locale={locale}
      actions={actions}
      labels={BOOK_LABELS}
      cover={<BookCover book={book} locale={locale} width={80} height={108} />}
      typeIcon={<BookIcon size={16} />}
      meta={<BookMeta book={book} locale={locale} />}
    />
  )
}

export function BookDetailSheet({
  book,
  locale,
  actions,
  onClose,
}: {
  book: Book
  locale: Locale
  actions: Omit<BookActions, 'onOpen'>
  onClose: () => void
}) {
  return (
    <MediaDetailSheet
      item={book}
      locale={locale}
      actions={actions}
      labels={BOOK_LABELS}
      cover={<BookCover book={book} locale={locale} width={104} height={140} />}
      meta={<BookMeta book={book} locale={locale} />}
      description={book.description}
      sourceHref={coverTapUrl(book)}
      onClose={onClose}
    />
  )
}
