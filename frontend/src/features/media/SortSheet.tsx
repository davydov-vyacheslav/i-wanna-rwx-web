import { Sheet } from '../../components/Sheet'
import { t, type Locale, type MessageKey } from '../../i18n'
import { CheckIcon } from './icons'
import type { SortOption } from './sort'

const OPTIONS: { value: SortOption; label: MessageKey }[] = [
  { value: 'titleAsc', label: 'media.sort.titleAsc' },
  { value: 'updatedDesc', label: 'media.sort.updatedDesc' },
]

/** Two radio rows, check on the active one; choosing applies and closes. */
export function SortSheet({
  locale,
  sort,
  onSelect,
  onClose,
}: {
  locale: Locale
  sort: SortOption
  onSelect: (sort: SortOption) => void
  onClose: () => void
}) {
  return (
    <Sheet title={t(locale, 'media.sort.title')} closeLabel={t(locale, 'media.filter.done')} onClose={onClose}>
      <div role="radiogroup" aria-label={t(locale, 'media.sort.title')} className="bg-surface rounded-md py-1">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={sort === o.value}
            onClick={() => {
              onSelect(o.value)
              onClose()
            }}
            className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left"
          >
            <span className="text-input flex-1">{t(locale, o.label)}</span>
            <span className="text-accent" aria-hidden="true">
              {sort === o.value && <CheckIcon size={20} />}
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
