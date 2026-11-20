import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { ApiClient } from '../../api/client'
import { t, type Locale, type MessageKey } from '../../i18n'
import type { Me } from '../identity/useMe'
import { BellIcon, BookIcon, FilmIcon, GearIcon, ShelfIcon } from '../media/icons'
import { BooksScreen } from '../media/BooksScreen'
import { MoviesScreen } from '../media/MoviesScreen'
import { prefersReducedMotion } from '../media/motion'
import { useRemindersState } from '../reminders/listState'
import { RemindersScreen } from '../reminders/RemindersScreen'
import type { ReminderType } from '../reminders/types'
import { Toast } from '../../components/Toast'
import { useServiceWorkerUpdate } from '../../pwa/useServiceWorkerUpdate'
import { SettingsScreen } from '../settings/SettingsScreen'

export type Tab = 'books' | 'movies' | 'reminders' | 'settings'
type MediaTab = 'books' | 'movies'

const MEDIA_TABS = ['books', 'movies'] as const
const REMINDER_SEGMENTS = ['subscriptions', 'licenses'] as const

const TABS: { id: Tab; label: MessageKey; icon: ReactNode }[] = [
  { id: 'books', label: 'nav.books', icon: <BookIcon size={24} /> },
  { id: 'movies', label: 'nav.movies', icon: <FilmIcon size={24} /> },
  { id: 'reminders', label: 'nav.reminders', icon: <BellIcon size={24} /> },
  { id: 'settings', label: 'nav.settings', icon: <GearIcon size={24} /> },
]

function parseTab(id: string | null): Tab | undefined {
  return TABS.find((x) => x.id === id)?.id
}

/** Hash path parts without `#/`: `#/reminders/licenses` -> ['reminders', 'licenses']. */
const hashParts = () => window.location.hash.replace(/^#\/?/, '').split('/')

const tabKey = (userId: string) => `rwx.tab.${userId}`

function storedTab(userId: string): Tab | undefined {
  try {
    return parseTab(localStorage.getItem(tabKey(userId)))
  } catch {
    return undefined
  }
}

/**
 * Current tab. The first hash segment (`#/movies`, `#/reminders/licenses`) wins, so the Back gesture and reloads keep it; without one the last
 * active tab of this user on this device is restored; first launch, a missing or corrupt value -> Books.
 */
function useTab(userId: string, segment: ReminderType): [Tab, (tab: Tab) => void] {
  const [launchTab] = useState<Tab>(() => storedTab(userId) ?? 'books')
  const [tab, setTab] = useState<Tab>(() => parseTab(hashParts()[0] ?? null) ?? launchTab)
  useEffect(() => {
    // the only history entry without a hash is the launch one, so an empty hash (Back to it) means the launch tab
    const onHash = () => {
      const [first] = hashParts()
      setTab(first ? (parseTab(first) ?? 'books') : launchTab)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [launchTab])
  useEffect(() => {
    try {
      localStorage.setItem(tabKey(userId), tab)
    } catch {
      // storage blocked: the tab just stays in memory
    }
  }, [userId, tab])
  // the Reminders route always carries its segment
  const select = useCallback(
    (next: Tab) => {
      setTab(next)
      window.history.pushState(null, '', next === 'reminders' ? `#/reminders/${segment}` : `#/${next}`)
    },
    [segment],
  )
  return [tab, select]
}

/**
 * Keeps the segment and the hash of the Reminders tab in step: a segment in the hash (deep link, Back) becomes the
 * remembered one; a bare or unknown `#/reminders` is rewritten to the remembered segment.
 */
function useReminderRoute(segment: ReminderType, setSegment: (s: ReminderType) => void) {
  useEffect(() => {
    const adopt = () => {
      const [first, second] = hashParts()
      if (first !== 'reminders') return
      if (second === 'subscriptions' || second === 'licenses') setSegment(second)
      else window.history.replaceState(null, '', `#/reminders/${segment}`)
    }
    adopt()
    window.addEventListener('hashchange', adopt)
    return () => window.removeEventListener('hashchange', adopt)
  }, [segment, setSegment])
}

/** One tab's screen: hidden (display none) and inert while inactive, so it is neither focusable nor announced. */
function TabPane({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div hidden={!active} inert={!active} aria-hidden={!active || undefined}>
      {children}
    </div>
  )
}

const barButton = (current: boolean) =>
  `text-[10px] min-[375px]:text-tab flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 active:opacity-70 ${current ? 'text-accent font-semibold' : 'text-ink-2'}`
const sideButton = (current: boolean) =>
  `text-input flex min-h-11 w-full items-center gap-3 rounded-md px-3 active:opacity-70 ${current ? 'bg-accent-soft text-accent font-semibold' : 'text-ink-2'}`

/** The phone bottom tab bar: four tabs, icon above label; hidden from `md`. */
function TabBar({ tab, locale, onTab }: { tab: Tab; locale: Locale; onTab: (tab: Tab) => void }) {
  return (
    <nav
      aria-label={t(locale, 'nav.label')}
      className="border-separator shrink-0 border-t-[0.5px] bg-[var(--tab-bg)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] backdrop-blur-xl md:hidden"
    >
      <ul className="flex">
        {TABS.map((x) => (
          <li key={x.id} className="min-w-0 flex-1">
            <button
              type="button"
              aria-current={x.id === tab ? 'page' : undefined}
              onClick={() => onTab(x.id)}
              className={barButton(x.id === tab)}
            >
              {x.icon}
              <span className="max-w-full truncate">{t(locale, x.label)}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * The left sidebar from `md` up: three always-expanded parents (Media, Reminders, Settings), the first two with
 * sub-items. Media has no route: its button opens the last used media tab.
 */
function Sidebar({
  tab,
  mediaTab,
  segment,
  locale,
  decorative,
  onTab,
  onSegment,
}: {
  tab: Tab | null
  mediaTab: MediaTab
  segment: ReminderType
  locale: Locale
  /** Signed-out look: labels only, no nav landmark, no controls, hidden from assistive tech and focus. */
  decorative?: boolean
  onTab: (tab: Tab) => void
  onSegment: (segment: ReminderType) => void
}) {
  const media = tab === 'books' || tab === 'movies'
  const groups: {
    id: string
    label: MessageKey
    icon: ReactNode
    current: boolean
    open: () => void
    itemsLabel?: MessageKey
    items?: { label: MessageKey; current: boolean; open: () => void }[]
  }[] = [
    {
      id: 'media',
      label: 'nav.media',
      icon: <ShelfIcon size={24} />,
      current: media,
      open: () => onTab(mediaTab),
      itemsLabel: 'nav.media',
      items: MEDIA_TABS.map((id) => ({
        label: `nav.${id}`,
        current: tab === id,
        open: () => onTab(id),
      })),
    },
    {
      id: 'reminders',
      label: 'nav.reminders',
      icon: <BellIcon size={24} />,
      current: tab === 'reminders',
      open: () => onTab('reminders'),
      itemsLabel: 'reminders.segments',
      items: REMINDER_SEGMENTS.map((key) => ({
        label: `reminders.${key}`,
        current: tab === 'reminders' && segment === key,
        open: () => onSegment(key),
      })),
    },
    {
      id: 'settings',
      label: 'nav.settings',
      icon: <GearIcon size={24} />,
      current: tab === 'settings',
      open: () => onTab('settings'),
    },
  ]
  const Root = decorative ? 'div' : 'nav'
  const Item = decorative ? 'span' : 'button'
  const controlProps = (current: boolean, open: () => void, currentValue: 'page' | 'true') =>
    decorative ? {} : { type: 'button' as const, 'aria-current': current ? currentValue : undefined, onClick: open }
  return (
    <Root
      {...(decorative ? { 'aria-hidden': true, inert: true } : { 'aria-label': t(locale, 'nav.label') })}
      className={`border-separator bg-surface hidden w-[var(--sidebar-w)] shrink-0 overflow-y-auto border-r-[0.5px] p-3 md:block ${decorative ? 'opacity-40' : ''}`}
    >
      <ul className="flex flex-col gap-1">
        {groups.map((g) => (
          <li key={g.id}>
            {/* only the leaf is announced as current: a parent with sub-items keeps just the highlight */}
            <Item {...controlProps(g.current && !g.items, g.open, 'page')} className={sideButton(g.current)}>
              {g.icon}
              <span className="max-w-full truncate">{t(locale, g.label)}</span>
            </Item>
            {g.items && g.itemsLabel && (
              <ul
                aria-label={decorative ? undefined : t(locale, g.itemsLabel)}
                className="mt-0.5 flex flex-col gap-0.5 pl-9"
              >
                {g.items.map((item) => (
                  <li key={item.label}>
                    <Item
                      {...controlProps(item.current, item.open, 'true')}
                      className={`text-body flex min-h-11 w-full items-center rounded-md px-3 active:opacity-70 ${item.current ? 'bg-accent-soft text-accent font-semibold' : 'text-ink-2'}`}
                    >
                      <span className="max-w-full truncate">{t(locale, item.label)}</span>
                    </Item>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Root>
  )
}

/** The sidebar as a picture for the signed-out screen: the same widths, borders and labels, nothing to operate. */
export function DecorativeSidebar({ locale }: { locale: Locale }) {
  return (
    <Sidebar
      decorative
      tab={null}
      mediaTab="books"
      segment="subscriptions"
      locale={locale}
      onTab={() => {}}
      onSegment={() => {}}
    />
  )
}

/**
 * Signed-in shell: one scroll region (safe-area top) above the bottom tab bar (safe-area bottom); from `md` up
 * the tab bar is a left sidebar and the region fills the rest. A tab's
 * screen mounts the first time it is opened and then stays mounted (search text, sheets, toasts survive);
 * inactive screens are `hidden` + `inert`, which also hides their fixed FAB, toast and sheets. Browsers drop
 * the scroll offset of a region whose content disappears, so the shell keeps one offset per tab and restores
 * it on switch. Tapping the current tab scrolls the region to the top.
 */
export function AppShell({ me, api, locale }: { me: Me; api?: ApiClient; locale: Locale }) {
  const reminders = useRemindersState({ userId: me.id, api })
  const { segment } = reminders.state
  const { setSegment } = reminders
  const [tab, select] = useTab(me.id, segment)
  useReminderRoute(segment, setSegment)
  // the Media parent opens the last used media tab; memory only, adjusted during render like `visited`
  const [mediaTab, setMediaTab] = useState<MediaTab>(tab === 'movies' ? 'movies' : 'books')
  if ((tab === 'books' || tab === 'movies') && tab !== mediaTab) setMediaTab(tab)
  const { updateReady, reload } = useServiceWorkerUpdate()
  const [updateDismissed, setUpdateDismissed] = useState(false)
  const region = useRef<HTMLElement>(null)
  const offsets = useRef<Record<Tab, number>>({ books: 0, movies: 0, reminders: 0, settings: 0 })
  const [visited, setVisited] = useState<readonly Tab[]>([tab])
  // mount on first visit (state adjusted during render, the documented pattern: React re-renders at once)
  if (!visited.includes(tab)) setVisited([...visited, tab])

  // runs before paint and before the browser's clamp-scroll event, so the old tab's offset is not overwritten
  useLayoutEffect(() => {
    if (region.current) region.current.scrollTop = offsets.current[tab]
  }, [tab])

  function onTab(next: Tab) {
    if (next !== tab) {
      if (region.current) offsets.current[tab] = region.current.scrollTop
      select(next)
      return
    }
    region.current?.scrollTo?.({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  function onSegment(next: ReminderType) {
    setSegment(next)
    // a view mode of the tab: Back leaves the tab, not the previous segment
    window.history.replaceState(null, '', `#/reminders/${next}`)
  }
  // the sidebar's sub-items work from any tab
  function openSegment(next: ReminderType) {
    if (tab !== 'reminders') onTab('reminders')
    onSegment(next)
  }

  return (
    <div className="bg-bg text-ink flex h-dvh flex-col overflow-hidden md:flex-row">
      <Sidebar tab={tab} mediaTab={mediaTab} segment={segment} locale={locale} onTab={onTab} onSegment={openSegment} />
      <main
        ref={region}
        onScroll={(e) => {
          offsets.current[tab] = e.currentTarget.scrollTop
        }}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]"
      >
        {/* the table screens need more width than the phone column; the FAB offset follows --column-w */}
        <div
          className={`mx-auto w-full max-w-[var(--column-w)] ${tab === 'settings' ? 'md:[--column-w:56rem]' : 'md:[--column-w:64rem]'}`}
        >
          {visited.includes('books') && (
            <TabPane active={tab === 'books'}>
              <BooksScreen locale={locale} userId={me.id} api={api} />
            </TabPane>
          )}
          {visited.includes('movies') && (
            <TabPane active={tab === 'movies'}>
              <MoviesScreen locale={locale} userId={me.id} api={api} />
            </TabPane>
          )}
          {visited.includes('reminders') && (
            <TabPane active={tab === 'reminders'}>
              <RemindersScreen
                locale={locale}
                api={api}
                state={reminders.state}
                onSegment={onSegment}
                onExpiring={reminders.setExpiring}
              />
            </TabPane>
          )}
          {visited.includes('settings') && (
            <TabPane active={tab === 'settings'}>
              <SettingsScreen me={me} api={api} locale={locale} />
            </TabPane>
          )}
        </div>
      </main>
      <TabBar tab={tab} locale={locale} onTab={onTab} />
      {updateReady && !updateDismissed && (
        <Toast
          tone="info"
          message={t(locale, 'app.update')}
          dismissLabel={t(locale, 'media.toast.dismiss')}
          onDismiss={() => setUpdateDismissed(true)}
          durationMs={15_000}
          action={{ label: t(locale, 'app.update.reload'), onClick: reload }}
        />
      )}
    </div>
  )
}
