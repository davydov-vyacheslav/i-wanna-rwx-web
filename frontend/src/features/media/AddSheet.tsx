import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { ApiClient } from '../../api/client'
import { Sheet } from '../../components/Sheet'
import { Spinner } from '../../components/Spinner'
import { t, type Locale } from '../../i18n'
import { format } from '../../i18n/format'
import { useDataSources } from '../settings/useDataSources'
import { findByIsbn, findByLink, titleInLibrary, type LibraryItem } from './duplicates'
import { isMediaError, type MediaError, type MediaErrorKind } from './errors'
import { errorMessage, sourceLabels, type MessageOverrides } from './errorMessage'
import { BookIcon, CheckIcon, FilmIcon, InfoIcon, TvIcon } from './icons'
import { InlineNotice, NoticeAction } from './InlineNotice'
import { CoverLink, YearRating } from './MediaCard'
import { openSettings } from './openSettings'
import { PreviewSheet } from './PreviewSheet'
import { SEARCH_MIN, useSearchBooks, type BookSearchHit, type MovieSearchHit, useSearchMovies } from './providerSearch'
import { draftLink, MAX_DRAFT_CODE_POINTS } from './sourceUrl'
import type { MediaKind } from './types'

/** Row taps are ignored this long after the list changed (the draft row jumps while results arrive). */
const SETTLE_MS = 300
/** Failures of an add that a retry with the same id can fix. */
const RETRYABLE: readonly MediaErrorKind[] = [
  'rate_limited',
  'provider_rate_limited',
  'provider_error',
  'provider_timeout',
  'timeout',
  'network',
]

/** The error when it says a source key is missing or refused. */
function keyError(e: unknown): MediaError | undefined {
  return isMediaError(e) && (e.kind === 'source_key_missing' || e.kind === 'source_key_invalid') ? e : undefined
}

/** A provider hit as the rows show it (a book hit or a movie/tv hit). */
interface ProviderRow {
  sourceUrl: string
  title: string
  year?: number
  rating?: number
  image?: string
  author?: string
  isbn?: string
  type?: 'movie' | 'tv'
}

/** Search failures worded for a search (the add wording says "nothing was added"); key problems have their own line. */
const SEARCH_ERRORS: MessageOverrides = {
  provider_error: 'media.search.error.provider_error',
  provider_timeout: 'media.search.error.provider_timeout',
  timeout: 'media.search.error.provider_timeout',
  rate_limited: 'media.search.error.rate_limited',
  provider_rate_limited: 'media.search.error.provider_rate_limited',
  network: 'media.add.searchUnavailable',
  server: 'media.search.error.server',
}

/** A failed add: shown inline; `url` is the entry it concerns (its Retry waits out a cooldown). */
interface Notice {
  message: string
  url: string
  action?: { label: string; onClick: () => void }
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/**
 * Add sheet: the title field, the source line (a selector only when the list has more than one available
 * source), and ONE list of entries that ends with the draft entry. Provider hits come from the server search
 * (offline, with sources or the search failing, or with no available source only the local draft entry is
 * listed). Every entry is added the same way, `create({id, sourceUrl})`; nothing else is sent and no details are
 * fetched. The row of the entry being added shows a spinner and nothing else can be tapped until the server
 * answers (the text field and the info buttons too). A failure is shown inside the sheet and keeps the row enabled; the same id is
 * re-sent until another entry is picked (idempotent); a `Retry-After` shows a countdown and the entry waits. The draft entry is not rendered when the typed text equals a library title; provider
 * entries already in the library (same `sourceUrl` as an item's `externalLink`, or the same ISBN) stay visible
 * and disabled.
 */
export function AddSheet({
  kind,
  locale,
  items,
  create,
  onClose,
  onDuplicate,
  api,
}: {
  kind: MediaKind
  locale: Locale
  /** The user's live items of this list, for the in-library rules. */
  items: readonly LibraryItem[]
  create: (
    req: { id: string; sourceUrl: string },
    handlers: { onSuccess: () => void; onError: (e: unknown) => void },
  ) => void
  onClose: () => void
  /** The server says the item exists (409 `existingId`): the list closes the sheet and selects it. */
  onDuplicate: (existingId: string) => void
  api?: ApiClient
}) {
  const hintId = useId()
  const [text, setText] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState<ProviderRow | null>(null)
  const [gone, setGone] = useState<readonly string[]>([])
  const [addNotice, setAddNotice] = useState<Notice | null>(null)
  const busy = useRef(false)
  const issued = useRef<{ sourceUrl: string; id: string } | null>(null)
  const [cooldown, setCooldown] = useState<{ url: string; left: number } | null>(null)
  const cooling = cooldown !== null
  useEffect(() => {
    if (!cooling) return
    const id = setInterval(() => setCooldown((c) => (c && c.left > 1 ? { ...c, left: c.left - 1 } : null)), 1000)
    return () => clearInterval(id)
  }, [cooling])

  const trimmed = text.trim()
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine)
  const dataSources = useDataSources(api)
  const list = dataSources.sources?.[kind === 'book' ? 'books' : 'movies']
  const available = list?.filter((s) => s.available) ?? []
  const effective = list?.find((s) => s.isEffective)
  const source = available.find((s) => s.id === (chosen ?? effective?.id))
  const canSearch = online && !!source
  const length = [...trimmed].length
  const typed = canSearch && length >= SEARCH_MIN
  const sourceId = source?.id ?? ''
  // the hook of the other kind gets no text, so it stays idle
  const books = useSearchBooks(kind === 'book' && canSearch ? trimmed : '', sourceId as 'open_library', api)
  const movies = useSearchMovies(kind === 'movie' && canSearch ? trimmed : '', sourceId as 'tmdb', api)
  const search = kind === 'book' ? books : movies

  const searchError = search.error
  const searchKeyError = keyError(searchError)
  const keyProblem = !!searchKeyError
  const labels = sourceLabels(dataSources.sources)
  // the effective source is named when none is usable (TMDb without a key)
  const keySource = effective?.id
  const needsKey = (!!list && available.length === 0) || keyProblem

  const hits: ProviderRow[] = []
  let serverDraft: { sourceUrl: string; title: string } | undefined
  for (const h of search.data ?? []) {
    if (h.kind === 'draft') serverDraft = h
    else if (kind === 'book') {
      const b = h as BookSearchHit
      hits.push({
        sourceUrl: b.sourceUrl,
        title: b.title,
        year: b.year,
        rating: b.rating,
        image: b.coverUrl,
        author: b.author,
        isbn: b.isbn,
      })
    } else {
      const m = h as MovieSearchHit
      hits.push({
        sourceUrl: m.sourceUrl,
        title: m.title,
        year: m.year,
        rating: m.rating,
        image: m.posterUrl,
        type: m.type,
      })
    }
  }
  const fresh = typed && search.isSuccess && !search.stale
  const visibleHits = fresh ? hits.filter((h) => !gone.includes(h.sourceUrl)) : []
  const searching = typed && (search.isPending || search.stale)
  const draftTitleHidden = !!trimmed && !!titleInLibrary(trimmed, items)
  const localLink = trimmed ? draftLink(trimmed) : undefined
  const draft = (fresh ? serverDraft : undefined) ?? (localLink ? { sourceUrl: localLink, title: trimmed } : undefined)
  const draftRow = draft && !draftTitleHidden ? draft : undefined

  // ONE state line under the field: offline or unavailable, else the key explanation, else the source in use
  const unavailable = !online || dataSources.isError
  const keyText = searchKeyError
    ? errorMessage(locale, searchKeyError, labels, { fallbackSource: source?.label })
    : format(t(locale, 'media.error.source_key_missing'), { source: labels[keySource ?? ''] ?? keySource ?? '' })
  const searchFailed = typed && !search.stale && search.isError && !keyProblem
  const searchFailure = searchFailed
    ? errorMessage(locale, searchError, labels, { overrides: SEARCH_ERRORS, fallbackSource: source?.label })
    : null
  const cooldownLeft = cooldown && addNotice?.url === cooldown.url ? cooldown.left : null

  // the rows jump while results arrive: a tap that lands right after a change is ignored
  const settling = useRef(true)
  const listKey = `${searching}|${visibleHits.map((h) => h.sourceUrl).join()}|${draftRow?.sourceUrl}`
  useEffect(() => {
    settling.current = true
    const id = setTimeout(() => (settling.current = false), SETTLE_MS)
    return () => clearTimeout(id)
  }, [listKey])
  const tap = (sourceUrl: string) => {
    if (!settling.current) pick(sourceUrl)
  }

  function inLibrary(row: ProviderRow) {
    return findByLink(row.sourceUrl, items) ?? (kind === 'book' ? findByIsbn(row.isbn, items) : undefined)
  }

  function fail(sourceUrl: string, e: unknown) {
    busy.current = false
    setAdding(null)
    if (isMediaError(e)) {
      if (e.kind === 'duplicate' && e.existingId) return onDuplicate(e.existingId)
      if (e.kind === 'source_not_found') setGone((g) => [...g, sourceUrl])
      // honour Retry-After: this entry waits until the server's wait is over
      if (e.retryAfter) setCooldown({ url: sourceUrl, left: Math.ceil(e.retryAfter) })
    }
    const message = errorMessage(locale, e, labels, { fallbackSource: source?.label })
    if (keyError(e))
      setAddNotice({
        message,
        url: sourceUrl,
        action: { label: t(locale, 'media.add.openSettings'), onClick: closeAndOpenSettings },
      })
    else if (isMediaError(e) && RETRYABLE.includes(e.kind))
      setAddNotice({
        message,
        url: sourceUrl,
        action: { label: t(locale, 'app.retry'), onClick: () => pick(sourceUrl) },
      })
    else setAddNotice({ message, url: sourceUrl })
  }

  function closeAndOpenSettings() {
    onClose()
    openSettings()
  }

  function pick(sourceUrl: string) {
    if (busy.current || cooldown?.url === sourceUrl) return
    busy.current = true
    // A retry of the same entry reuses its id; a different entry gets a new one.
    if (issued.current?.sourceUrl !== sourceUrl) issued.current = { sourceUrl, id: crypto.randomUUID() }
    const req = { id: issued.current.id, sourceUrl }
    setAdding(sourceUrl)
    setAddNotice(null)
    create(req, { onSuccess: onClose, onError: (e) => fail(sourceUrl, e) })
  }

  const rowClass =
    'bg-surface text-ink text-body min-h-11 w-full rounded-md px-4 py-2 text-left font-semibold [overflow-wrap:anywhere] active:opacity-80 disabled:opacity-60'
  // the 44px target comes from padding that a negative margin takes back, so the link does not stretch its line of text
  const linkClass = 'text-accent -my-3 inline-block py-3 font-semibold underline'

  return (
    <>
      <Sheet
        title={t(locale, 'media.add')}
        closeLabel={t(locale, 'media.close')}
        onClose={onClose}
        fullHeight
        inert={!!previewing}
      >
        <label className="block">
          <span className="text-foot text-ink-2 mb-1 block font-medium">
            {t(locale, kind === 'book' ? 'media.add.label.book' : 'media.add.label.movie')}
          </span>
          <input
            type="text"
            data-autofocus
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="done"
            maxLength={MAX_DRAFT_CODE_POINTS}
            value={text}
            disabled={!!adding}
            onChange={(e) => {
              setText(e.target.value)
              setAddNotice(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.preventDefault()
            }}
            aria-describedby={hintId}
            className="bg-surface-2 text-input text-ink min-h-11 w-full rounded-md px-3"
          />
        </label>
        {(unavailable || needsKey || source) && (
          <p aria-live="polite" className="text-foot text-ink-2 mt-2">
            {unavailable ? (
              t(locale, 'media.add.searchUnavailable')
            ) : needsKey ? (
              <>
                {keyText}{' '}
                <button type="button" onClick={closeAndOpenSettings} className={linkClass}>
                  {t(locale, 'media.add.openSettings')}
                </button>
              </>
            ) : (
              format(t(locale, 'media.add.searchingIn'), { source: source?.label ?? '' })
            )}
          </p>
        )}
        {available.length > 1 && (
          <div
            role="group"
            aria-label={t(locale, 'media.add.source')}
            className="bg-surface-2 mt-2 flex gap-0.5 rounded-md p-0.5"
          >
            {available.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={s.id === source?.id}
                onClick={() => setChosen(s.id)}
                className={`text-body min-h-11 flex-1 truncate rounded-sm px-2 font-semibold ${s.id === source?.id ? 'bg-surface text-ink shadow-sm' : 'text-ink-2'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        {length < SEARCH_MIN && (
          <p id={hintId} className="text-foot text-ink-2 mt-2">
            {t(locale, 'media.add.hint')}
          </p>
        )}
        {(addNotice ?? searchFailure) && (
          <InlineNotice message={addNotice?.message ?? searchFailure ?? ''}>
            {addNotice &&
              (cooldownLeft !== null ? (
                <span className="px-3 font-semibold">
                  {format(t(locale, 'media.add.retryIn'), { n: cooldownLeft })}
                </span>
              ) : (
                addNotice.action && <NoticeAction label={addNotice.action.label} onClick={addNotice.action.onClick} />
              ))}
          </InlineNotice>
        )}

        {(searching || visibleHits.length > 0 || draftRow) && (
          <ul className="mt-2 flex flex-col gap-2">
            {searching && (
              <li
                role="status"
                aria-label={t(locale, 'media.add.searching')}
                className="text-ink-2 flex min-h-11 items-center justify-center"
              >
                <Spinner />
              </li>
            )}
            {visibleHits.map((row) => {
              const mine = inLibrary(row)
              return (
                <li key={row.sourceUrl} className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      disabled={!!adding || !!mine}
                      aria-disabled={cooldown?.url === row.sourceUrl || undefined}
                      onClick={() => tap(row.sourceUrl)}
                      className={`${rowClass} flex items-center gap-3`}
                    >
                      <CoverLink
                        title={row.title}
                        src={row.image}
                        placeholder={
                          kind === 'book' ? (
                            <BookIcon size={24} />
                          ) : row.type === 'tv' ? (
                            <TvIcon size={24} />
                          ) : (
                            <FilmIcon size={24} />
                          )
                        }
                        locale={locale}
                        width={60}
                        height={80}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2">{row.title}</span>
                        <span className="block font-normal">
                          {row.type && (
                            <span className="text-ink-2 text-foot flex items-center gap-1">
                              {row.type === 'tv' ? <TvIcon size={14} /> : <FilmIcon size={14} />}
                              {t(locale, row.type === 'tv' ? 'media.type.tv' : 'media.type.movie')}
                            </span>
                          )}
                          <YearRating year={row.year} rating={row.rating} locale={locale} />
                          {kind === 'book' && (
                            <span className="text-foot text-ink-2 line-clamp-1">
                              {row.author || t(locale, 'media.noAuthor')}
                            </span>
                          )}
                        </span>
                      </span>
                      {adding === row.sourceUrl && <Spinner />}
                    </button>
                    {mine && (
                      <span className="bg-seen-bg text-seen text-foot mt-1 ml-4 inline-flex items-center gap-1 rounded-full px-2 font-medium">
                        <CheckIcon size={16} />
                        {t(locale, 'media.add.inLibrary')}
                      </span>
                    )}
                  </div>
                  {!mine && (
                    <button
                      type="button"
                      aria-label={format(t(locale, 'media.preview.open'), { title: row.title })}
                      disabled={!!adding}
                      onClick={() => setPreviewing(row)}
                      className="text-accent flex size-11 shrink-0 items-center justify-center disabled:opacity-60"
                    >
                      <InfoIcon />
                    </button>
                  )}
                </li>
              )
            })}
            {fresh && visibleHits.length === 0 && (
              <li className="text-foot text-ink-2 px-1">
                {format(t(locale, 'media.add.noResults'), { source: source?.label ?? '' })}
              </li>
            )}
            {draftRow && (
              <li key={draftRow.sourceUrl}>
                <button
                  type="button"
                  disabled={!!adding}
                  aria-disabled={cooldown?.url === draftRow.sourceUrl || undefined}
                  onClick={() => tap(draftRow.sourceUrl)}
                  className={`${rowClass} flex items-center gap-2`}
                >
                  <span className="line-clamp-2 flex-1">
                    {format(t(locale, 'media.add.draft'), { title: draftRow.title })}
                  </span>
                  {adding === draftRow.sourceUrl && <Spinner />}
                </button>
              </li>
            )}
          </ul>
        )}
        {draftTitleHidden && visibleHits.length === 0 && !searching && (
          <p className="text-foot text-ink-2 mt-2">{t(locale, 'media.add.allInLibrary')}</p>
        )}
      </Sheet>
      {previewing && (
        <PreviewSheet
          kind={kind}
          sourceUrl={previewing.sourceUrl}
          title={previewing.title}
          locale={locale}
          canAdd={!adding && cooldown?.url !== previewing.sourceUrl}
          onAdd={() => {
            setPreviewing(null)
            pick(previewing.sourceUrl)
          }}
          onClose={() => setPreviewing(null)}
          api={api}
        />
      )}
    </>
  )
}
