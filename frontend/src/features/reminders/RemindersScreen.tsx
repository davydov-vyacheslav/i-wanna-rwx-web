import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ApiClient } from '../../api/client'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Segments } from '../../components/Segments'
import { Toast } from '../../components/Toast'
import { useWide } from '../../components/useWide'
import { t, type Locale, type MessageKey } from '../../i18n'
import { format } from '../../i18n/format'
import { countLabel, countText } from '../media/counts'
import { errorMessage } from '../media/errorMessage'
import { CalendarIcon, FilterIcon, KeyIcon, PlusIcon, SearchIcon } from '../media/icons'
import { useSettings } from '../settings/useSettings'
import { ExpiringSheet } from './ExpiringSheet'
import { activeCount, applyExpiring, type ExpiringFilter } from './filters'
import { useDeleteReminder, useReminders } from './hooks'
import { ReminderCard } from './ReminderCard'
import { ReminderDetail } from './ReminderDetail'
import { ReminderSheet } from './ReminderSheet'
import { RemindersTable } from './RemindersTable'
import { sortReminders } from './sort'
import type { ReminderType, Subscription } from './types'
import type { RemindersState } from './listState'
import { todayIn, urgencyOf } from './urgency'

const NO_ROWS: readonly Subscription[] = []
const noop = () => {}

const SEGMENTS: readonly ReminderType[] = ['subscriptions', 'licenses']

const TEXTS = {
  subscriptions: {
    title: 'reminders.empty.subscriptions.title',
    prompt: 'reminders.empty.subscriptions.prompt',
    add: 'reminders.add.subscriptions',
    icon: <CalendarIcon size={48} />,
  },
  licenses: {
    title: 'reminders.empty.licenses.title',
    prompt: 'reminders.empty.licenses.prompt',
    add: 'reminders.add.licenses',
    icon: <KeyIcon size={48} />,
  },
} as const satisfies Record<
  ReminderType,
  { title: MessageKey; prompt: MessageKey; add: MessageKey; icon: React.ReactNode }
>

/** The two segments share this screen; only the data type, the empty-state texts and the stored filter differ. */
function RemindersList({
  type,
  locale,
  api,
  expiring,
  onExpiring,
  segments,
}: {
  type: ReminderType
  locale: Locale
  api?: ApiClient
  expiring: ExpiringFilter
  onExpiring: (filter: ExpiringFilter) => void
  segments: React.ReactNode
}) {
  const query = useReminders(type, api)
  const remove = useDeleteReminder(type, api)
  const { settings } = useSettings(api)
  const zone = settings?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const today = todayIn(zone)
  // the wide table has sortable columns and no filter: a filter chosen on a phone is not applied there
  const wide = useWide()
  const filter: ExpiringFilter = wide ? 'all' : expiring
  const [filtering, setFiltering] = useState(false)
  const [confirming, setConfirming] = useState<Subscription | null>(null)
  const [adding, setAdding] = useState(false)
  // the detail sheet, and whether the edit sheet is open above it; the record is read from the list, so a row that
  // is removed (deleted, or a 404/410) takes its sheets with it
  const [view, setView] = useState<{ id: string; editing: boolean } | null>(null)
  const [toast, setToast] = useState<{ message: string; tone?: 'info' } | null>(null)

  const all = useMemo(() => (Array.isArray(query.data) ? (query.data as Subscription[]) : []), [query.data])
  const rows = useMemo(() => sortReminders(applyExpiring(all, filter, today), locale), [all, filter, today, locale])
  const filterCount = activeCount(filter)
  const loading = query.isPending
  const selected = view ? all.find((x) => x.id === view.id) : undefined
  const loadFailed = query.isError && !query.data

  const closeConfirm = () => {
    setConfirming(null)
    // a swiped card goes back to rest (Cancel, or a failed delete that kept the row)
    document.querySelectorAll('[data-swipe]').forEach((card) => ((card as HTMLElement).scrollLeft = 0))
  }
  function confirmDelete(item: Subscription) {
    remove.mutateAsync(item.id).then(closeConfirm, (e) => {
      closeConfirm()
      fail(e)
    })
  }
  function fail(e: unknown, validation?: MessageKey) {
    const overrides = {
      gone: 'reminders.error.gone',
      not_found: 'reminders.error.gone',
      network: 'reminders.error.network',
      ...(validation && { validation }),
    } as const
    setToast({ message: errorMessage(locale, e, {}, { overrides }) })
  }

  const texts = TEXTS[type]
  return (
    <section aria-busy={loading} className="text-ink px-4 pb-24">
      <div inert={filtering} aria-hidden={filtering || undefined}>
        <header className={wide ? 'pt-2 pb-4' : 'pt-2'}>
          <div className={`flex justify-between gap-3 ${wide ? 'min-h-11 items-center' : 'items-baseline'}`}>
            <h1 className="text-title font-bold">{t(locale, wide ? `reminders.${type}` : 'reminders.title')}</h1>
            {/* the count is about the filter, which the wide table does not have */}
            {wide ? (
              !loading &&
              !loadFailed &&
              all.length > 0 && (
                <button
                  type="button"
                  aria-label={t(locale, texts.add)}
                  onClick={() => setAdding(true)}
                  className="bg-accent text-on-accent text-input flex min-h-11 items-center gap-1 rounded-md px-4 font-semibold"
                >
                  <PlusIcon size={20} />
                  {t(locale, 'media.add')}
                </button>
              )
            ) : (
              <p aria-live="polite" className="text-body text-ink-2 font-medium">
                {loading ? '' : countText(countLabel(rows.length, all.length), locale)}
              </p>
            )}
          </div>
        </header>
        {/* from md up the sidebar carries the two sections and the table sorts instead of filtering */}
        {!wide && (
          <div className="bg-bg sticky top-0 z-10 -mx-4 flex items-center gap-2 px-4 py-2">
            <div className="min-w-0 flex-1">{segments}</div>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={
                filterCount > 0
                  ? format(t(locale, 'media.filter.openActive'), { n: filterCount })
                  : t(locale, 'media.filter.open')
              }
              onClick={() => setFiltering(true)}
              className={`relative flex size-11 shrink-0 items-center justify-center rounded-md ${filterCount > 0 ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-ink-2'}`}
            >
              <FilterIcon on={filterCount > 0} />
              {filterCount > 0 && (
                <span
                  aria-hidden="true"
                  className="bg-accent text-on-accent text-chip absolute -top-1 -right-1 flex min-w-[18px] items-center justify-center rounded-full px-1 font-semibold"
                >
                  {filterCount}
                </span>
              )}
            </button>
          </div>
        )}

        {loading && wide ? (
          <RemindersTable rows={NO_ROWS} today={today} locale={locale} onOpen={noop} onDelete={noop} loading />
        ) : loading ? (
          <ul role="status" aria-label={t(locale, 'reminders.loading')} className="flex flex-col gap-[10px]">
            {[0, 1, 2, 3].map((i) => (
              <li
                key={i}
                className="bg-surface rounded-card flex h-[88px] flex-col gap-2 p-[10px] animate-pulse motion-reduce:animate-none"
              >
                <div className="bg-surface-2 h-4 w-3/4 rounded-full" />
                <div className="bg-surface-2 h-3 w-1/2 rounded-full" />
              </li>
            ))}
          </ul>
        ) : loadFailed ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p role="alert" className="text-body text-ink-2">
              {t(locale, navigator.onLine ? 'reminders.loadError' : 'reminders.loadError.offline')}
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
        ) : all.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="text-draft">{texts.icon}</span>
            <h2 className="text-sheet font-semibold">{t(locale, texts.title)}</h2>
            <p className="text-body text-ink-2">{t(locale, texts.prompt)}</p>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="bg-accent text-on-accent text-input min-h-11 rounded-md px-6 font-semibold"
            >
              {t(locale, texts.add)}
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="text-draft">
              <SearchIcon size={48} />
            </span>
            <h2 className="text-sheet font-semibold">{t(locale, 'media.nomatch.title')}</h2>
            <button
              type="button"
              onClick={() => onExpiring('all')}
              className="bg-surface-2 text-ink text-input min-h-11 rounded-md px-6 font-semibold"
            >
              {t(locale, 'media.filter.reset')}
            </button>
          </div>
        ) : wide ? (
          <RemindersTable
            rows={rows}
            today={today}
            locale={locale}
            onOpen={(item) => setView({ id: item.id, editing: false })}
            onDelete={setConfirming}
          />
        ) : (
          <ul className="flex flex-col gap-[10px]">
            {rows.map((item) => (
              <li key={item.id}>
                <ReminderCard
                  item={item}
                  urgency={urgencyOf(item, today)}
                  locale={locale}
                  onOpen={() => setView({ id: item.id, editing: false })}
                  onDelete={() => setConfirming(item)}
                />
              </li>
            ))}
          </ul>
        )}

        {!wide && !loading && !loadFailed && all.length > 0 && (
          <button
            type="button"
            aria-label={t(locale, texts.add)}
            onClick={() => setAdding(true)}
            className="bg-accent text-on-accent shadow-fab fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-20 flex size-14 items-center justify-center rounded-full active:scale-95"
          >
            <PlusIcon />
          </button>
        )}
      </div>

      {adding && <ReminderSheet type={type} locale={locale} api={api} onClose={() => setAdding(false)} />}
      {selected && (
        <ReminderDetail
          type={type}
          item={selected}
          urgency={urgencyOf(selected, today)}
          locale={locale}
          api={api}
          inert={view?.editing ?? false}
          onClose={() => setView(null)}
          onEdit={() => setView({ id: selected.id, editing: true })}
          onDelete={() => setConfirming(selected)}
          onRenewed={(message) => setToast({ message, tone: 'info' })}
          onRenewFailed={(e) => fail(e, 'reminders.error.renewRange')}
        />
      )}
      {selected && view?.editing && (
        <ReminderSheet
          type={type}
          item={selected}
          locale={locale}
          api={api}
          onClose={() => setView({ id: selected.id, editing: false })}
        />
      )}
      {filtering && !wide && (
        <ExpiringSheet
          locale={locale}
          filter={expiring}
          shown={rows.length}
          total={all.length}
          onChange={onExpiring}
          onClose={() => setFiltering(false)}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title={t(locale, 'media.confirmDelete.title')}
          body={format(t(locale, 'media.confirmDelete.body'), { title: confirming.name })}
          confirmLabel={t(locale, 'media.delete')}
          cancelLabel={t(locale, 'media.cancel')}
          pending={remove.isPending}
          onConfirm={() => confirmDelete(confirming)}
          onCancel={closeConfirm}
        />
      )}
      {toast && (
        <Toast
          message={toast.message}
          tone={toast.tone}
          dismissLabel={t(locale, 'media.toast.dismiss')}
          onDismiss={() => setToast(null)}
        />
      )}
    </section>
  )
}

/**
 * The Reminders tab: the Subscriptions / Licenses control (phones; the sidebar has it from `md` up and changes
 * `state.segment` from outside) above one list screen per segment. A segment's screen mounts on first visit and then
 * stays mounted (own filter sheet, toast), hidden and inert while inactive; the shell's single scroll region keeps
 * one offset per segment here.
 */
export function RemindersScreen({
  locale,
  api,
  state,
  onSegment,
  onExpiring,
}: {
  locale: Locale
  api?: ApiClient
  state: RemindersState
  onSegment: (segment: ReminderType) => void
  onExpiring: (type: ReminderType, filter: ExpiringFilter) => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const offsets = useRef<Record<ReminderType, number>>({ subscriptions: 0, licenses: 0 })
  const [visited, setVisited] = useState<readonly ReminderType[]>([state.segment])
  if (!visited.includes(state.segment)) setVisited([...visited, state.segment])
  const shown = useRef(state.segment)

  // the segment can change from outside (the sidebar), so the offset is recorded as the region scrolls
  useEffect(() => {
    const region = root.current?.closest('main')
    const record = () => {
      offsets.current[shown.current] = region?.scrollTop ?? 0
    }
    region?.addEventListener('scroll', record, { passive: true })
    return () => region?.removeEventListener('scroll', record)
  }, [])

  // before paint: restore the offset of the entered segment (the one just left was recorded by the scroll listener)
  useLayoutEffect(() => {
    const region = root.current?.closest('main')
    if (!region || shown.current === state.segment) return
    region.scrollTop = offsets.current[state.segment]
    shown.current = state.segment
  }, [state.segment])

  return (
    <div ref={root}>
      {SEGMENTS.filter((type) => visited.includes(type)).map((type) => (
        <div key={type} hidden={type !== state.segment} inert={type !== state.segment}>
          <RemindersList
            type={type}
            locale={locale}
            api={api}
            expiring={state.expiring[type]}
            onExpiring={(f) => onExpiring(type, f)}
            segments={
              <Segments
                label={t(locale, 'reminders.segments')}
                options={SEGMENTS.map((key) => ({ key, label: t(locale, `reminders.${key}`) }))}
                value={state.segment}
                onSelect={onSegment}
              />
            }
          />
        </div>
      ))}
    </div>
  )
}
