import { t, type Locale, type MessageKey } from '../../i18n'
import type { TypeFilter } from './filters'

const OPTIONS: { key: TypeFilter; label: MessageKey }[] = [
  { key: 'all', label: 'media.type.all' },
  { key: 'movie', label: 'media.movies.title' },
  { key: 'tv', label: 'media.type.tv.plural' },
]

/** All / Movies / Series under the search row: a shortcut for the type filter (the sheet has no type row). */
export function TypeSegments({
  locale,
  value,
  onSelect,
}: {
  locale: Locale
  value: TypeFilter
  onSelect: (v: TypeFilter) => void
}) {
  return (
    <div
      role="group"
      aria-label={t(locale, 'media.type.label')}
      className="bg-surface-2 mt-2 flex gap-0.5 rounded-md p-0.5"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onSelect(o.key)}
          className={`text-body min-h-11 flex-1 truncate rounded-sm px-2 font-semibold ${value === o.key ? 'bg-surface text-ink shadow-sm' : 'text-ink-2'}`}
        >
          {t(locale, o.label)}
        </button>
      ))}
    </div>
  )
}
