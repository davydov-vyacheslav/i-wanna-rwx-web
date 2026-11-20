import type { ApiClient } from '../../api/client'
import type { Locale } from '../../i18n'
import { AddSheet } from './AddSheet'
import { BOOK_LABELS, BookCard, BookDetailSheet } from './BookCard'
import { useBooks, useCreateBook, useDeleteBook, useUpdateBook } from './hooks'
import { BookIcon } from './icons'
import { ListScreen, type ListData, type ListTexts } from './ListScreen'
import { MediaTable, type TableSpec } from './MediaTable'
import type { Book } from './types'

const TEXTS: ListTexts = {
  title: 'media.books.title',
  searchLabel: 'media.search.label',
  emptyTitle: 'media.empty.title',
  emptyPrompt: 'media.empty.prompt',
  emptyAdd: 'media.empty.add',
  seenFilter: 'media.filter.seenBook',
}

const TABLE: TableSpec<Book> = { kind: 'book', labels: BOOK_LABELS, cover: (b) => b.coverUrl, author: (b) => b.author }

/** Books list, self-contained: data hooks plus the shared `ListScreen` (state, filters, sort, sheets, toast). */
export function BooksScreen({ locale, userId, api }: { locale: Locale; userId?: string; api?: ApiClient }) {
  const books = useBooks(api)
  const create = useCreateBook(api)
  const update = useUpdateBook(api)
  const remove = useDeleteBook(api)
  const data: ListData<Book> = {
    query: books,
    // mutateAsync, not mutate(vars, callbacks): per-call callbacks are dropped when a later mutate() supersedes this one
    patch: (b, patch, onError) => {
      update.mutateAsync({ id: b.id, patch: { ...patch, version: b.version } }).catch(onError)
    },
    remove: (b, { onSuccess, onError }) => {
      remove.mutateAsync(b.id).then(onSuccess, onError)
    },
  }
  return (
    <ListScreen
      kind="book"
      locale={locale}
      userId={userId}
      api={api}
      data={data}
      texts={TEXTS}
      renderAdd={(ctx) => (
        <AddSheet
          kind="book"
          locale={locale}
          items={books.data ?? []}
          create={(req, h) => void create.mutateAsync(req).then(h.onSuccess, h.onError)}
          api={api}
          {...ctx}
        />
      )}
      emptyIcon={<BookIcon size={48} />}
      renderTable={(rows, actions, loading) => (
        <MediaTable rows={rows} spec={TABLE} locale={locale} api={api} actions={actions} loading={loading} />
      )}
      renderCard={(b, actions) => <BookCard key={b.id} book={b} locale={locale} actions={actions} />}
      renderDetail={(b, actions, onClose) => (
        <BookDetailSheet book={b} locale={locale} actions={actions} onClose={onClose} />
      )}
    />
  )
}
