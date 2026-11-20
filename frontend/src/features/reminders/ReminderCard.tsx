import { t, type Locale, type MessageKey } from '../../i18n'
import { format } from '../../i18n/format'
import { ClockAlertIcon, ClockIcon, InfinityIcon, TrashIcon, XCircleIcon } from '../media/icons'
import type { Subscription } from './types'
import type { Urgency } from './urgency'

const DAYS: Record<Intl.LDMLPluralRule, MessageKey> = {
  zero: 'reminders.days.other',
  one: 'reminders.days.one',
  two: 'reminders.days.other',
  few: 'reminders.days.few',
  many: 'reminders.days.many',
  other: 'reminders.days.other',
}

export function daysText(locale: Locale, n: number): string {
  return format(t(locale, DAYS[new Intl.PluralRules(locale).select(n)]), { n })
}

/** Urgency as a status pill (icon plus text, never colour alone); `ok` has none. */
export function UrgencyBadge({ urgency, locale }: { urgency: Urgency; locale: Locale }) {
  if (urgency.kind === 'ok') return null
  const { text, icon, tone } =
    urgency.kind === 'expired'
      ? { text: t(locale, 'reminders.badge.expired'), icon: <XCircleIcon />, tone: 'bg-danger text-on-accent' }
      : urgency.kind === 'lifetime'
        ? { text: t(locale, 'reminders.badge.forever'), icon: <InfinityIcon />, tone: 'bg-surface-2 text-ink-2' }
        : urgency.kind === 'critical'
          ? {
              text: urgency.days === 0 ? t(locale, 'reminders.badge.today') : daysText(locale, urgency.days),
              icon: <ClockAlertIcon />,
              tone: 'bg-danger-bg text-danger',
            }
          : { text: daysText(locale, urgency.days), icon: <ClockIcon />, tone: 'bg-warn-bg text-warn' }
  return (
    <span
      className={`inline-flex min-h-4 items-center gap-0.5 rounded-full px-1.5 text-[10px] leading-3 font-medium [&_svg]:size-2.5 ${tone}`}
    >
      {icon}
      {text}
    </span>
  )
}

export const PATTERNS: Record<'monthly' | 'yearly' | 'none' | 'lifetime', MessageKey> = {
  monthly: 'reminders.pattern.monthly',
  yearly: 'reminders.pattern.yearly',
  none: 'reminders.pattern.none',
  lifetime: 'reminders.pattern.lifetime',
}

export function patternText(item: Subscription, locale: Locale): string {
  return item.renewalPattern === 'custom'
    ? format(t(locale, 'reminders.pattern.custom'), { n: item.customRenewalDays ?? 0 })
    : t(locale, PATTERNS[item.renewalPattern])
}

/** The day never shifts: the `YYYY-MM-DD` value is formatted in UTC. */
export function formatDate(expiryDate: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(expiryDate))
}

/** `15 Apr 2026 · Monthly · cost`; lifetime has no date. */
function metaLine(item: Subscription, locale: Locale): string {
  const date = item.expiryDate ? formatDate(item.expiryDate, locale) : null
  return [date, patternText(item, locale), item.cost].filter(Boolean).join(' · ')
}

/**
 * Subscription or license card (the list wraps it in the `<li>`). Swipe left (CSS scroll-snap) reveals Delete, a real
 * button so keyboard users reach it too.
 */
export function ReminderCard({
  item,
  urgency,
  locale,
  onOpen,
  onDelete,
}: {
  item: Subscription
  urgency: Urgency
  locale: Locale
  onOpen: () => void
  onDelete: () => void
}) {
  return (
    <div
      data-swipe
      className="bg-surface rounded-card flex scroll-smooth motion-reduce:scroll-auto snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <button
        type="button"
        onClick={onOpen}
        className="min-h-11 w-full min-w-0 shrink-0 snap-start p-[10px] text-left outline-none"
      >
        <span className="text-body line-clamp-2 block font-semibold [overflow-wrap:anywhere]">{item.name}</span>
        <span className="text-foot text-ink-2 block">{metaLine(item, locale)}</span>
        <span className="mt-1 flex flex-wrap gap-1">
          <UrgencyBadge urgency={urgency} locale={locale} />
        </span>
      </button>
      <button
        type="button"
        aria-label={format(t(locale, 'media.deleteItem'), { title: item.name })}
        onClick={onDelete}
        className="bg-danger-bg text-danger flex w-24 shrink-0 snap-end items-center justify-center"
      >
        <TrashIcon />
      </button>
    </div>
  )
}
