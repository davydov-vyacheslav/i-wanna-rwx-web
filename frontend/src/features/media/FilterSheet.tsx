import { Sheet } from '../../components/Sheet'
import { t, type Locale, type MessageKey } from '../../i18n'
import { format } from '../../i18n/format'
import { cycleFilter, type Filters, type TriState } from './filters'
import { CheckIcon, MinusIcon } from './icons'

const WORD: Record<TriState, MessageKey> = {
  all: 'media.filter.any',
  include: 'media.filter.only',
  exclude: 'media.filter.hide',
}
const CHECKED = { all: false, include: true, exclude: 'mixed' } as const

/** Whole 52px row is the target. Shape (empty / check / minus) plus a word, never colour alone. */
export function TriRow({
  label,
  state,
  onToggle,
  locale,
}: {
  label: string
  state: TriState
  onToggle: () => void
  locale: Locale
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={CHECKED[state]}
      onClick={onToggle}
      className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left"
    >
      <span
        aria-hidden="true"
        className={`flex size-7 shrink-0 items-center justify-center rounded-sm border-2 ${
          state === 'include'
            ? 'bg-accent border-accent text-on-accent'
            : state === 'exclude'
              ? 'bg-danger border-danger text-on-accent'
              : 'border-draft'
        }`}
      >
        {state === 'include' && <CheckIcon size={16} />}
        {state === 'exclude' && <MinusIcon size={16} />}
      </span>
      <span className="text-input flex-1">{label}</span>
      <span className="text-body text-ink-2">{t(locale, WORD[state])}</span>
    </button>
  )
}

/**
 * Tri-state filters (Any / Only / Hide), applied live. The type is chosen with the segmented
 * control on the Movies page, so the sheet has no type row; "Ended" shows only for series.
 */
export function FilterSheet({
  locale,
  filters,
  showEnded,
  seenLabel,
  shown,
  total,
  onChange,
  onReset,
  onClose,
}: {
  locale: Locale
  filters: Filters
  showEnded: boolean
  seenLabel: MessageKey
  shown: number
  total: number
  onChange: (filters: Filters) => void
  onReset: () => void
  onClose: () => void
}) {
  const row = (key: 'favorite' | 'seen' | 'draft' | 'ended', label: MessageKey) => (
    <TriRow
      locale={locale}
      label={t(locale, label)}
      state={filters[key]}
      onToggle={() => onChange(cycleFilter(filters, key))}
    />
  )
  return (
    <Sheet
      title={t(locale, 'media.filter.title')}
      closeLabel={t(locale, 'media.filter.done')}
      onClose={onClose}
      leading={
        <button
          type="button"
          onClick={onReset}
          className="text-accent text-input min-h-11 min-w-16 text-left font-semibold"
        >
          {t(locale, 'media.filter.reset')}
        </button>
      }
    >
      <div role="group" aria-label={t(locale, 'media.filter.title')} className="bg-surface rounded-md py-1">
        {row('favorite', 'media.filter.favorite')}
        {row('seen', seenLabel)}
        {row('draft', 'media.filter.draft')}
        {showEnded && row('ended', 'media.filter.ended')}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-live="polite"
        className="bg-accent text-on-accent text-input mt-4 min-h-12 w-full rounded-md font-semibold"
      >
        {format(t(locale, 'media.filter.show'), { shown, total })}
      </button>
    </Sheet>
  )
}
