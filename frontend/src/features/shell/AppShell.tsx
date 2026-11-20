import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { ApiClient } from '../../api/client'
import { t, type Locale, type MessageKey } from '../../i18n'
import type { Me } from '../identity/useMe'
import { BellIcon, BookIcon, FilmIcon, GearIcon } from '../media/icons'
import { BooksScreen } from '../media/BooksScreen'
import { MoviesScreen } from '../media/MoviesScreen'
import { prefersReducedMotion } from '../media/motion'
import { useRemindersState } from '../reminders/listState'
import { RemindersScreen } from '../reminders/RemindersScreen'
import type { ReminderType } from '../reminders/types'
import { SettingsScreen } from '../settings/SettingsScreen'

export type Tab = 'books' | 'movies' | 'reminders' | 'settings'

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

/**
 * The three entries as buttons. Phones get them as the bottom tab bar (icon above label), from `md` up as the
 * left sidebar (icon beside label); `AppShell` renders both and CSS shows one, so nothing needs matchMedia.
 */
function TabNav({
  variant,
  tab,
  segment,
  locale,
  onTab,
  onSegment,
}: {
  variant: 'bar' | 'sidebar'
  tab: Tab
  segment: ReminderType
  locale: Locale
  onTab: (tab: Tab) => void
  onSegment: (segment: ReminderType) => void
}) {
  const bar = variant === 'bar'
  return (
    <nav
      aria-label={t(locale, 'nav.label')}
      className={
        bar
          ? 'border-separator shrink-0 border-t-[0.5px] bg-[var(--tab-bg)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] backdrop-blur-xl md:hidden'
          : 'border-separator bg-surface hidden w-[var(--sidebar-w)] shrink-0 overflow-y-auto border-r-[0.5px] p-3 md:block'
      }
    >
      <ul className={bar ? 'flex' : 'flex flex-col gap-1'}>
        {TABS.map((x) => {
          const current = x.id === tab
          return (
            <li key={x.id} className="min-w-0 flex-1">
              <button
                type="button"
                aria-current={current ? 'page' : undefined}
                onClick={() => onTab(x.id)}
                className={
                  bar
                    ? `text-[10px] min-[375px]:text-tab flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 active:opacity-70 ${current ? 'text-accent font-semibold' : 'text-ink-2'}`
                    : `text-input flex min-h-11 w-full items-center gap-3 rounded-md px-3 active:opacity-70 ${current ? 'bg-accent-soft text-accent font-semibold' : 'text-ink-2'}`
                }
              >
                {x.icon}
                <span className="max-w-full truncate">{t(locale, x.label)}</span>
              </button>
              {!bar && x.id === 'reminders' && (
                <ul aria-label={t(locale, 'reminders.segments')} className="mt-1 flex flex-col gap-1 pl-9">
                  {(['subscriptions', 'licenses'] as const).map((key) => {
                    const on = current && segment === key
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          aria-current={on ? 'true' : undefined}
                          onClick={() => onSegment(key)}
                          className={`text-body flex min-h-9 w-full items-center rounded-md px-3 active:opacity-70 ${on ? 'bg-accent-soft text-accent font-semibold' : 'text-ink-2'}`}
                        >
                          <span className="max-w-full truncate">{t(locale, `reminders.${key}`)}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
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
      <TabNav variant="sidebar" tab={tab} segment={segment} locale={locale} onTab={onTab} onSegment={openSegment} />
      <main
        ref={region}
        onScroll={(e) => {
          offsets.current[tab] = e.currentTarget.scrollTop
        }}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]"
      >
        {/* the reminders table needs more width than the phone column; the FAB offset follows --column-w */}
        <div className={`mx-auto w-full max-w-[var(--column-w)] ${tab === 'reminders' ? 'md:[--column-w:60rem]' : ''}`}>
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
      <TabNav variant="bar" tab={tab} segment={segment} locale={locale} onTab={onTab} onSegment={openSegment} />
    </div>
  )
}
