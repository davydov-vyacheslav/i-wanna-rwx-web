import { useState, type ReactNode } from 'react'
import { Sheet } from '../../components/Sheet'
import { t, type Locale, type MessageKey } from '../../i18n'
import { format } from '../../i18n/format'
import { CheckIcon, ClockIcon, EyeIcon, HeartIcon, StarIcon, TrashIcon } from './icons'
import { isDraft, type ListItem } from './types'

/** Message keys that differ between lists (books are "read", movies "watched"). */
export interface MediaLabels {
  seen: MessageKey
  markSeen: MessageKey
  markPlanned: MessageKey
}

export interface ItemActions<T> {
  onOpen: (item: T) => void
  onToggleFavorite: (item: T) => void
  onToggleSeen: (item: T) => void
  onDelete: (item: T) => void
}

export function formatRating(rating: number | undefined, locale: Locale): string | null {
  if (!rating) return null
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(rating)
}

function StatusBadge({ status, locale, seenKey }: { status: ListItem['status']; locale: Locale; seenKey: MessageKey }) {
  const seen = status === 'seen'
  return (
    <span
      className={`text-chip inline-flex min-h-[22px] items-center gap-1 rounded-full px-2 font-medium ${
        seen ? 'bg-seen-bg text-seen' : 'bg-planned-bg text-planned'
      }`}
    >
      {seen ? <CheckIcon /> : <ClockIcon />}
      {t(locale, seen ? seenKey : 'media.status.planned')}
    </span>
  )
}

const SOURCE_KEYS: Record<string, MessageKey> = {
  draft: 'media.source.draft',
  open_library: 'media.source.openLibrary',
  tmdb: 'media.source.tmdb',
}

/** Label of a source id: translated for the ones this client knows, the raw id for any other. */
function sourceLabel(locale: Locale, source: string): string {
  const key = Object.hasOwn(SOURCE_KEYS, source) ? SOURCE_KEYS[source] : undefined
  return key ? t(locale, key) : source
}

function SourceBadge({ item, locale }: { item: ListItem; locale: Locale }) {
  return (
    <span className="bg-surface-2 text-ink-2 text-chip inline-flex min-h-[22px] items-center rounded-full px-2 font-medium">
      {sourceLabel(locale, item.source)}
    </span>
  )
}

/** Cover button: opens the source page in a new tab; a placeholder when there is no (or a broken) cover. */
export function CoverLink({
  href,
  title,
  src,
  placeholder,
  locale,
  width,
  height,
}: {
  /** Only a vetted https link (`coverTapUrl`); without one the cover is not a link. */
  href?: string
  title: string
  src?: string
  placeholder: ReactNode
  locale: Locale
  width: number
  height: number
}) {
  const [broken, setBroken] = useState(false)
  const className = 'bg-surface-2 text-draft flex shrink-0 items-center justify-center overflow-hidden rounded-sm'
  const content = (
    <>
      {src && !broken ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="size-full object-cover"
        />
      ) : (
        placeholder
      )}
    </>
  )
  if (!href)
    return (
      <div style={{ width, height }} className={className}>
        {content}
      </div>
    )
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={format(t(locale, 'media.openSourceFor'), { title })}
      style={{ width, height }}
      className={className}
    >
      {content}
    </a>
  )
}

/** Year (or em dash) and star + rating (or N/A): the two meta lines shared by every list. */
export function YearRating({ year, rating, locale }: { year?: number; rating?: number; locale: Locale }) {
  const text = formatRating(rating, locale)
  return (
    <>
      <p className="text-foot text-ink-2">{year ?? '—'}</p>
      <p className="text-foot text-ink-2 flex items-center gap-1">
        <span className="text-star">
          <StarIcon />
        </span>
        <span aria-label={text ? format(t(locale, 'media.rating'), { value: text }) : undefined}>
          {text ?? t(locale, 'media.noRating')}
        </span>
      </p>
    </>
  )
}

const iconButton = 'flex h-[54px] w-11 items-center justify-center active:scale-90 motion-reduce:active:scale-100'

/**
 * List card body (the list wraps it in the `<li>`). Swipe left (CSS scroll-snap, no JS) reveals Delete; the Delete button is a normal
 * focusable button so keyboard and switch users reach it too, and the detail sheet has it as well.
 */
export function MediaCard<T extends ListItem>({
  item,
  locale,
  actions,
  labels,
  cover,
  typeIcon,
  meta,
}: {
  item: T
  locale: Locale
  actions: ItemActions<T>
  labels: MediaLabels
  cover: ReactNode
  typeIcon: ReactNode
  meta: ReactNode
}) {
  const fav = item.isFavorite === true
  const seen = item.status === 'seen'
  return (
    <div
      data-swipe
      className="bg-surface rounded-card flex scroll-smooth motion-reduce:scroll-auto snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-full shrink-0 snap-start gap-[10px] p-[10px]">
        {cover}
        {/* owner decision: no focus indicator on the big open area (the other buttons keep the global ring) */}
        <button
          type="button"
          onClick={() => actions.onOpen(item)}
          className="min-h-11 min-w-0 flex-1 text-left focus-visible:outline-none"
        >
          <span className="flex items-start gap-1.5">
            <span className={`mt-0.5 shrink-0 ${isDraft(item) ? 'text-draft' : 'text-accent'}`}>{typeIcon}</span>
            <span className="text-body line-clamp-2 font-semibold [overflow-wrap:anywhere]">{item.title}</span>
          </span>
          {meta}
          <span className="mt-1 flex flex-wrap gap-1">
            <StatusBadge status={item.status} locale={locale} seenKey={labels.seen} />
            <SourceBadge item={item} locale={locale} />
          </span>
        </button>
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            aria-label={t(locale, fav ? 'media.unfavorite' : 'media.favorite')}
            onClick={() => actions.onToggleFavorite(item)}
            className={`${iconButton} ${fav ? 'text-fav' : 'text-ink-2'}`}
          >
            <HeartIcon on={fav} />
          </button>
          <button
            type="button"
            aria-label={t(locale, seen ? labels.markPlanned : labels.markSeen)}
            onClick={() => actions.onToggleSeen(item)}
            className={`${iconButton} ${seen ? 'text-seen' : 'text-ink-2'}`}
          >
            <EyeIcon on={seen} />
          </button>
        </div>
      </div>
      <button
        type="button"
        aria-label={format(t(locale, 'media.deleteItem'), { title: item.title })}
        onClick={() => actions.onDelete(item)}
        className="bg-danger-bg text-danger flex w-24 shrink-0 snap-end items-center justify-center"
      >
        <TrashIcon />
      </button>
    </div>
  )
}

const pill =
  'bg-surface-2 text-ink text-body flex min-h-11 items-center justify-center rounded-full px-4 font-semibold active:opacity-80'

/** Item detail: full description (or "No description.") and the actions (the swipe action's visible twin). */
export function MediaDetailSheet<T extends ListItem>({
  item,
  locale,
  actions,
  labels,
  cover,
  meta,
  subtitle,
  description,
  sourceHref,
  onClose,
}: {
  item: T
  locale: Locale
  actions: Omit<ItemActions<T>, 'onOpen'>
  labels: MediaLabels
  cover: ReactNode
  meta: ReactNode
  subtitle?: string
  description?: string
  sourceHref?: string
  onClose: () => void
}) {
  const fav = item.isFavorite === true
  const seen = item.status === 'seen'
  return (
    <Sheet title={item.title} closeLabel={t(locale, 'media.close')} onClose={onClose}>
      <div className="flex gap-4">
        {cover}
        <div className="min-w-0 flex-1">
          <h3 className="text-detail font-bold [overflow-wrap:anywhere]">{item.title}</h3>
          {subtitle && <p className="text-foot text-ink-2 [overflow-wrap:anywhere]">{subtitle}</p>}
          {meta}
          <div className="mt-2 flex flex-wrap gap-1">
            <StatusBadge status={item.status} locale={locale} seenKey={labels.seen} />
            <SourceBadge item={item} locale={locale} />
          </div>
        </div>
      </div>
      <p className="text-body text-ink mt-4 whitespace-pre-line [overflow-wrap:anywhere]">
        {description || <span className="text-ink-2">{t(locale, 'media.noDescription')}</span>}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={pill} onClick={() => actions.onToggleFavorite(item)}>
          {t(locale, fav ? 'media.unfavorite' : 'media.favorite')}
        </button>
        <button type="button" className={pill} onClick={() => actions.onToggleSeen(item)}>
          {t(locale, seen ? labels.markPlanned : labels.markSeen)}
        </button>
        {sourceHref && (
          <a href={sourceHref} target="_blank" rel="noopener noreferrer" className={pill}>
            {t(locale, 'media.openSource')}
          </a>
        )}
        <button type="button" className={`${pill} !bg-danger-bg text-danger`} onClick={() => actions.onDelete(item)}>
          {t(locale, 'media.delete')}
        </button>
      </div>
    </Sheet>
  )
}
