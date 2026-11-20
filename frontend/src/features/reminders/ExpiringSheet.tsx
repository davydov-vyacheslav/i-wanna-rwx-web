import { Sheet } from '../../components/Sheet'
import { t, type Locale } from '../../i18n'
import { format } from '../../i18n/format'
import { cycle } from '../media/filters'
import { TriRow } from '../media/FilterSheet'
import type { ExpiringFilter } from './filters'

/** The expiring-soon filter (one tri-state row), applied live; same sheet pattern as the media filters. */
export function ExpiringSheet({
  locale,
  filter,
  shown,
  total,
  onChange,
  onClose,
}: {
  locale: Locale
  filter: ExpiringFilter
  shown: number
  total: number
  onChange: (filter: ExpiringFilter) => void
  onClose: () => void
}) {
  return (
    <Sheet
      title={t(locale, 'media.filter.title')}
      closeLabel={t(locale, 'media.filter.done')}
      onClose={onClose}
      leading={
        <button
          type="button"
          onClick={() => onChange('all')}
          className="text-accent text-input min-h-11 min-w-16 text-left font-semibold"
        >
          {t(locale, 'media.filter.reset')}
        </button>
      }
    >
      <div role="group" aria-label={t(locale, 'media.filter.title')} className="bg-surface rounded-md py-1">
        <TriRow
          locale={locale}
          label={t(locale, 'reminders.filter.expiring')}
          state={filter}
          onToggle={() => onChange(cycle(filter))}
        />
      </div>
      <p className="text-foot text-ink-2 mt-2 px-1">{t(locale, 'reminders.filter.note')}</p>
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
