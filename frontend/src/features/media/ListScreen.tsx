import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ApiClient } from '../../api/client'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Segments } from '../../components/Segments'
import { focusQuietly } from '../../components/opener'
import { Toast } from '../../components/Toast'
import { useWide } from '../../components/useWide'
import { t, type Locale, type MessageKey } from '../../i18n'
import { format } from '../../i18n/format'
import { buildView, countText } from './counts'
import { errorMessage } from './errorMessage'
import { FilterSheet } from './FilterSheet'
import { selectType, showTypeButtons, type TypeFilter } from './filters'
import { FilterIcon, MoreIcon, PlusIcon, SearchIcon, SortIcon } from './icons'
import { useListState, type ListName } from './listState'
import type { ItemActions } from './MediaCard'
import { LEAVE_MS, prefersReducedMotion } from './motion'
import { DEFAULT_SORT, sortItems } from './sort'
import { SortSheet } from './SortSheet'
import type { ListItem, MediaKind } from './types'

/** What the data hooks of one list expose to the shell. */
export interface ListData<T> {
  query: { data?: T[]; isPending: boolean; isError: boolean; isFetching: boolean; refetch: () => Promise<unknown> }
  patch: (item: T, patch: { isFavorite?: boolean; status?: 'planned' | 'seen' }, onError: (e: unknown) => void) => void
  remove: (item: T, handlers: { onSuccess: () => void; onError: (e: unknown) => void }) => void
}

export interface ListTexts {
  title: MessageKey
  searchLabel: MessageKey
  emptyTitle: MessageKey
  emptyPrompt: MessageKey
  emptyAdd: MessageKey
  /** Label of the "seen" filter row (Read / Watched). */
  seenFilter: MessageKey
}

/** What the list hands to the add sheet of its kind. */
interface AddContext {
  onClose: () => void
  /** Closes the sheet and opens the existing item (409 `existingId`). */
  onDuplicate: (existingId: string) => void
}

/** All / Movies / Series under the search row: a shortcut for the type filter (the sheet has no type row). */
const TYPE_OPTIONS: { key: TypeFilter; label: MessageKey }[] = [
  { key: 'all', label: 'media.type.all' },
  { key: 'movie', label: 'media.movies.title' },
  { key: 'tv', label: 'media.type.tv.plural' },
]

const squareButton = 'relative flex size-11 shrink-0 items-center justify-center rounded-md'

/** One list row. While `leaving` it fades and collapses (opacity + grid row height), then the row is dropped. */
function Row({ leaving, children }: { leaving: boolean; children: ReactNode }) {
  return (
    <li
      data-leaving={leaving ? 'true' : undefined}
      className={`grid transition-[grid-template-rows,opacity] duration-[220ms] ease-out motion-reduce:transition-none ${
        leaving ? 'pointer-events-none grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
      }`}
    >
      <div className="min-h-0 overflow-hidden pb-[10px]">{children}</div>
    </li>
  )
}

/** Rows that a toggle just filtered out stay mounted for LEAVE_MS and fade; the map value is the row as it will be. */
function useLeaving<T extends { id: string }>() {
  const [leaving, setLeaving] = useState<ReadonlyMap<string, T>>(() => new Map())
  const [timers] = useState(() => new Map<string, ReturnType<typeof setTimeout>>())
  useEffect(() => () => timers.forEach(clearTimeout), [timers])
  const stopLeaving = useCallback(
    (id: string) => {
      clearTimeout(timers.get(id))
      timers.delete(id)
      setLeaving((m) => {
        if (!m.has(id)) return m
        const next = new Map(m)
        next.delete(id)
        return next
      })
    },
    [timers],
  )
  const startLeaving = (item: T) => {
    clearTimeout(timers.get(item.id))
    setLeaving((m) => new Map(m).set(item.id, item))
    timers.set(
      item.id,
      setTimeout(() => stopLeaving(item.id), LEAVE_MS),
    )
  }
  return { leaving, startLeaving, stopLeaving }
}

/**
 * Shared list screen (books and movies): header with count, search, filter and sort buttons, loading / error / empty
 * states, cards, detail sheet, toast and FAB. From `md` up the cards are a table whose headers sort (no Sort control,
 * the title order is the default) and the Add button sits in the page header instead of the FAB. Per-kind pieces (cards, detail sheet, texts, data
 * hooks) come in as props. The shell (F8) supplies the scroll region and tab bar; `renderAdd`
 * renders the add sheet (F7), without it no add affordance shows.
 */
export function ListScreen<T extends ListItem & { version: number }>({
  kind,
  locale,
  userId,
  api,
  renderAdd,
  onMenu,
  data,
  texts,
  emptyIcon,
  renderCard,
  renderTable,
  renderDetail,
}: {
  kind: MediaKind
  locale: Locale
  userId?: string
  api?: ApiClient
  renderAdd?: (ctx: AddContext) => ReactNode
  /** Optional list menu: a button next to Sort calls this (the screen opens its own sheet). */
  onMenu?: () => void
  data: ListData<T>
  texts: ListTexts
  emptyIcon: ReactNode
  renderCard: (item: T, actions: ItemActions<T>) => ReactNode
  /** The list from `md` up; `loading` asks for the placeholder rows. */
  renderTable: (rows: readonly T[], actions: ItemActions<T>, loading: boolean) => ReactNode
  renderDetail: (item: T, actions: Omit<ItemActions<T>, 'onOpen'>, onClose: () => void) => ReactNode
}) {
  const listName: ListName = kind === 'book' ? 'books' : 'movies'
  const list = useListState(listName, { userId, api })
  const wide = useWide()
  const { query } = data
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [panel, setPanel] = useState<'filter' | 'sort' | null>(null)
  const onAdd = renderAdd ? () => setAdding(true) : undefined
  const [failure, setFailure] = useState<{ error: unknown } | null>(null)
  const [confirming, setConfirming] = useState<T | null>(null)
  const [deleting, setDeleting] = useState(false)

  const all = useMemo(() => (Array.isArray(query.data) ? query.data : []), [query.data])
  // the table sorts by its headers: the stored (phone) sort does not apply there
  const state = useMemo(
    () => (wide && list.state.sort !== DEFAULT_SORT ? { ...list.state, sort: DEFAULT_SORT } : list.state),
    [wide, list.state],
  )
  const view = useMemo(() => buildView(all, state, kind, locale), [all, state, kind, locale])
  // the sheet reads the full list, so an item that just left the filtered view stays open
  const selected = selectedId ? all.find((b) => b.id === selectedId) : undefined

  const fail = (error: unknown) => setFailure({ error })

  const { leaving, startLeaving, stopLeaving } = useLeaving<T>()
  const visible = (item: T) => buildView([item], list.state, kind, locale).shown > 0
  /** Patch with a fade when the toggle makes the active filter/search hide the row. A failed patch cancels the fade. */
  const toggle = (item: T, patch: Partial<T>) => {
    const next = { ...item, ...patch }
    // the table fades the rows that leave by itself
    if (!wide && !visible(next) && visible(item) && !prefersReducedMotion()) startLeaving(next)
    else stopLeaving(item.id)
    data.patch(item, patch as { isFavorite?: boolean; status?: 'planned' | 'seen' }, (e) => {
      stopLeaving(item.id)
      fail(e)
    })
  }

  const actions: ItemActions<T> = {
    onOpen: (item) => setSelectedId(item.id),
    onToggleFavorite: (item) => toggle(item, { isFavorite: !item.isFavorite } as Partial<T>),
    onToggleSeen: (item) => toggle(item, { status: item.status === 'seen' ? 'planned' : 'seen' } as Partial<T>),
    // swipe, card button and detail sheet all ask first; the request runs only on confirm
    onDelete: (item) => setConfirming(item),
  }

  function confirmDelete(item: T) {
    setDeleting(true)
    data.remove(item, {
      onSuccess: () => {
        deleted.current = item.id
        setSelectedId((cur) => (cur === item.id ? null : cur))
        closeConfirm()
      },
      onError: (e) => {
        closeConfirm()
        fail(e)
      },
    })
  }
  const closeConfirm = () => {
    setConfirming(null)
    setDeleting(false)
    // a swiped card goes back to rest (Cancel, or a failed delete that kept the row)
    document.querySelectorAll('[data-swipe]').forEach((card) => ((card as HTMLElement).scrollLeft = 0))
  }

  // view rows plus the fading ones (which the filter already hides), kept in sort order
  const rows = useMemo(() => {
    const inView = new Set(view.items.map((i) => i.id))
    const extra = [...leaving.values()].filter((i) => !inView.has(i.id))
    return extra.length ? sortItems([...view.items, ...extra], list.state.sort, locale) : view.items
  }, [view.items, leaving, list.state.sort, locale])

  // The table moves focus to a neighbouring row itself; when no row is left, the Add control takes it.
  const deleted = useRef<string | null>(null)
  useEffect(() => {
    // the server answered, but the list may still hold the item for a render
    if (!deleted.current || all.some((x) => x.id === deleted.current)) return
    deleted.current = null
    if (wide && rows.length === 0) focusQuietly(document.querySelector<HTMLElement>('[data-add]'))
  })

  const { filters } = list.state
  // The segments are the Movies type filter; keep them while a type is selected so it can be undone
  const segments =
    kind === 'movie' && (filters.type !== 'all' || showTypeButtons(all as unknown as { type: 'movie' | 'tv' }[]))
  const count = countText(view.count, locale)
  // a sheet is open above the list: nothing behind it is focusable or announced
  const covered = adding || !!selected || panel !== null
  const loading = query.isPending
  const loadFailed = query.isError && !query.data
  // wide: an empty library or a failed load shows the state alone, without the toolbar and the Add button
  const bare = wide && (loadFailed || (!loading && view.total === 0))
  const showAdd = wide && !!onAdd && !loading && !loadFailed && view.total > 0
  const filterLabel =
    list.filterCount > 0
      ? format(t(locale, 'media.filter.openActive'), { n: list.filterCount })
      : t(locale, 'media.filter.open')

  const search = (
    <label
      className={`bg-surface-2 text-ink-2 flex min-h-11 flex-1 items-center gap-2 rounded-md px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${wide ? 'max-w-sm min-w-32' : 'min-w-0'}`}
    >
      <SearchIcon size={18} />
      <input
        type="search"
        data-focus-fallback
        value={list.state.search}
        onChange={(e) => list.setSearch(e.target.value)}
        aria-label={t(locale, texts.searchLabel)}
        placeholder={t(locale, texts.searchLabel)}
        className="text-input text-ink placeholder:text-ink-2 min-w-0 flex-1 truncate bg-transparent text-ellipsis outline-none"
      />
    </label>
  )
  const filterButton = (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={filterLabel}
      onClick={() => setPanel('filter')}
      className={`${wide ? 'text-body ml-auto size-11 font-semibold gap-1 lg:w-auto lg:gap-2 lg:px-3' : 'size-11'} relative flex shrink-0 items-center justify-center rounded-md ${list.filterActive ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-ink-2'}`}
    >
      <FilterIcon on={list.filterActive} />
      {wide && <span className="hidden lg:inline">{t(locale, 'media.filter.open')}</span>}
      {list.filterCount > 0 && (
        <span
          aria-hidden="true"
          className={`bg-accent text-on-accent text-chip flex min-w-[18px] items-center justify-center rounded-full px-1 font-semibold ${wide ? '' : 'absolute -top-1 -right-1'}`}
        >
          {list.filterCount}
        </span>
      )}
    </button>
  )
  const moreButton = onMenu && (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={t(locale, 'media.menu.open')}
      title={t(locale, 'media.menu.open')}
      onClick={onMenu}
      className={`${squareButton} bg-surface-2 text-ink-2`}
    >
      <MoreIcon />
    </button>
  )
  const typeSegments = segments && (
    <Segments
      className={wide ? 'w-56 lg:w-[17rem]' : 'mt-2'}
      label={t(locale, 'media.type.label')}
      options={TYPE_OPTIONS.map((o) => ({ key: o.key, label: t(locale, o.label) }))}
      value={filters.type}
      onSelect={(v) =>
        // a second tap on the selected type goes back to All
        list.setFilters(v === 'all' ? { ...filters, type: 'all', ended: 'all' } : selectType(filters, v))
      }
    />
  )
  const statePad = wide ? 'py-24' : 'py-16'

  return (
    <section aria-busy={loading} className="text-ink px-4 pb-24">
      <div inert={covered} aria-hidden={covered || undefined}>
        <header className={wide ? 'pt-2 pb-4' : 'pt-2'}>
          <div className={`flex gap-3 ${wide ? 'h-11 items-center' : 'items-baseline justify-between'}`}>
            <h1 className="text-title font-bold">{t(locale, texts.title)}</h1>
            {!wide && (
              <p aria-live="polite" className="text-body text-ink-2 font-medium">
                {count}
              </p>
            )}
            {showAdd && (
              <button
                type="button"
                data-add
                aria-label={t(locale, texts.emptyAdd)}
                onClick={onAdd}
                className="bg-accent text-on-accent text-input ml-auto flex min-h-11 items-center gap-1 rounded-md px-4 font-semibold"
              >
                <PlusIcon size={20} />
                {t(locale, 'media.add')}
              </button>
            )}
          </div>
        </header>
        {wide ? (
          !bare && (
            <div className="flex h-14 items-center gap-2 pb-3">
              {search}
              {typeSegments}
              {filterButton}
              {moreButton}
            </div>
          )
        ) : (
          <div className="bg-bg sticky top-0 z-10 -mx-4 px-4 py-2">
            <div className="flex items-center gap-2">
              {search}
              {filterButton}
              <button
                type="button"
                aria-haspopup="dialog"
                aria-label={t(locale, 'media.sort.open')}
                onClick={() => setPanel('sort')}
                className={`${squareButton} bg-surface-2 text-ink-2`}
              >
                <SortIcon />
              </button>
              {moreButton}
            </div>
            {typeSegments}
          </div>
        )}

        {loading ? (
          wide ? (
            renderTable([], actions, true)
          ) : (
            <ul role="status" aria-label={t(locale, 'media.loading')} className="flex flex-col gap-[10px]">
              {[0, 1, 2, 3].map((i) => (
                <li
                  key={i}
                  className="bg-surface border-separator rounded-card flex h-[128px] gap-3 border-[0.5px] p-3 animate-pulse motion-reduce:animate-none"
                >
                  <div className="bg-surface-2 h-full w-[72px] shrink-0 rounded-md" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
                    <div className="bg-surface-2 h-4 w-3/4 rounded-full" />
                    <div className="bg-surface-2 h-3 w-1/2 rounded-full" />
                    <div className="bg-surface-2 h-3 w-1/3 rounded-full" />
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : loadFailed ? (
          <div className={`flex flex-col items-center gap-4 text-center ${statePad}`}>
            <p role="alert" className="text-body text-ink-2">
              {t(locale, navigator.onLine ? 'media.loadError' : 'media.loadError.offline')}
            </p>
            <button
              type="button"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
              className="bg-accent text-on-accent text-input min-h-11 rounded-md px-6 font-semibold disabled:opacity-60"
            >
              {t(locale, 'app.retry')}
            </button>
          </div>
        ) : view.total === 0 ? (
          <div className={`flex flex-col items-center gap-3 text-center ${statePad}`}>
            <span className="text-draft">{emptyIcon}</span>
            <h2 className="text-sheet font-semibold">{t(locale, texts.emptyTitle)}</h2>
            <p className="text-body text-ink-2">{t(locale, texts.emptyPrompt)}</p>
            {onAdd && (
              <button
                type="button"
                data-add
                onClick={onAdd}
                className="bg-accent text-on-accent text-input min-h-11 rounded-md px-6 font-semibold"
              >
                {t(locale, texts.emptyAdd)}
              </button>
            )}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="text-draft">
              <SearchIcon size={48} />
            </span>
            <h2 className="text-sheet font-semibold">{t(locale, 'media.nomatch.title')}</h2>
            <button
              type="button"
              onClick={() => {
                list.resetFilters()
                list.setSearch('')
              }}
              className="bg-surface-2 text-ink text-input min-h-11 rounded-md px-6 font-semibold"
            >
              {t(locale, 'media.nomatch.reset')}
            </button>
          </div>
        ) : wide ? (
          renderTable(rows, actions, false)
        ) : (
          <ul>
            {rows.map((item) => (
              <Row key={item.id} leaving={leaving.has(item.id)}>
                {renderCard(item, actions)}
              </Row>
            ))}
          </ul>
        )}

        {!wide && onAdd && (
          <button
            type="button"
            aria-label={t(locale, 'media.add')}
            onClick={onAdd}
            className="bg-accent text-on-accent shadow-fab fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-20 flex size-14 items-center justify-center rounded-full active:scale-95"
          >
            <PlusIcon />
          </button>
        )}
      </div>

      {adding &&
        renderAdd?.({
          onClose: () => setAdding(false),
          onDuplicate: (id) => {
            setAdding(false)
            setSelectedId(id)
          },
        })}
      {selected && renderDetail(selected, actions, () => setSelectedId(null))}
      {panel === 'filter' && (
        <FilterSheet
          locale={locale}
          filters={filters}
          showEnded={kind === 'movie' && filters.type === 'tv'}
          seenLabel={texts.seenFilter}
          shown={view.shown}
          total={view.total}
          onChange={list.setFilters}
          onReset={list.resetFilters}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'sort' && (
        <SortSheet locale={locale} sort={list.state.sort} onSelect={list.setSort} onClose={() => setPanel(null)} />
      )}
      {confirming && (
        <ConfirmDialog
          title={t(locale, 'media.confirmDelete.title')}
          body={format(t(locale, 'media.confirmDelete.body'), { title: confirming.title })}
          confirmLabel={t(locale, 'media.delete')}
          cancelLabel={t(locale, 'media.cancel')}
          pending={deleting}
          onConfirm={() => confirmDelete(confirming)}
          onCancel={closeConfirm}
        />
      )}
      {failure && (
        <Toast
          message={errorMessage(locale, failure.error)}
          dismissLabel={t(locale, 'media.toast.dismiss')}
          onDismiss={() => setFailure(null)}
        />
      )}
    </section>
  )
}
