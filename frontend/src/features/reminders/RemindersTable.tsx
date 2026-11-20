import { useMemo, useState } from 'react'
import { t, type Locale } from '../../i18n'
import { format } from '../../i18n/format'
import { ColumnSortIcon, TrashIcon } from '../media/icons'
import { formatDate, patternText, UrgencyBadge } from './ReminderCard'
import type { Subscription } from './types'
import { urgencyOf } from './urgency'

type Column = 'name' | 'expiry' | 'renewal' | 'cost'
type Sort = { column: Column; dir: 'asc' | 'desc' }

const COLUMNS = [
  { key: 'name', label: 'reminders.form.name' },
  { key: 'expiry', label: 'reminders.detail.expires' },
  { key: 'renewal', label: 'reminders.form.renewal' },
  { key: 'cost', label: 'reminders.form.cost' },
] as const

/**
 * The list for wide screens: one row per reminder, sortable by column. The incoming order (expiry soonest first) is the
 * default; a header click sorts ascending, the next click descending, the third restores the default. A missing value
 * (lifetime date, no cost) is always last, whatever the direction. The sort is device-local view state.
 */
export function RemindersTable({
  rows,
  today,
  locale,
  onOpen,
  onDelete,
}: {
  rows: readonly Subscription[]
  today: string
  locale: Locale
  onOpen: (item: Subscription) => void
  onDelete: (item: Subscription) => void
}) {
  const [sort, setSort] = useState<Sort | null>(null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true })
    const value = (r: Subscription): string | null | undefined =>
      ({ name: r.name, expiry: r.expiryDate, renewal: patternText(r, locale), cost: r.cost })[sort.column]
    const sign = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const x = value(a)
      const y = value(b)
      if (x === y) return 0
      if (x == null) return 1
      if (y == null) return -1
      return sign * collator.compare(x, y)
    })
  }, [rows, sort, locale])

  const click = (column: Column) =>
    setSort(sort?.column !== column ? { column, dir: 'asc' } : sort.dir === 'asc' ? { column, dir: 'desc' } : null)

  return (
    <table className="bg-surface rounded-card text-body w-full border-separate border-spacing-0 text-left">
      <thead>
        <tr>
          {COLUMNS.map((c) => {
            const dir = sort?.column === c.key ? sort.dir : undefined
            return (
              <th
                key={c.key}
                scope="col"
                aria-sort={dir ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                className="border-separator text-foot text-ink-2 border-b-[0.5px] p-0 font-semibold"
              >
                <button
                  type="button"
                  onClick={() => click(c.key)}
                  className={`flex min-h-11 w-full items-center gap-1 px-3 text-left whitespace-nowrap ${dir ? 'text-ink' : ''}`}
                >
                  {t(locale, c.label)}
                  <ColumnSortIcon dir={dir} />
                </button>
              </th>
            )
          })}
          <th scope="col" className="border-separator w-14 border-b-[0.5px]">
            <span className="sr-only">{t(locale, 'media.delete')}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((item) => (
          <tr key={item.id} onClick={() => onOpen(item)} className="hover:bg-surface-2 cursor-pointer">
            <td className="border-separator w-full min-w-0 border-b-[0.5px] p-0 font-semibold">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpen(item)
                }}
                className="line-clamp-2 min-h-11 w-full px-3 text-left [overflow-wrap:anywhere]"
              >
                {item.name}
              </button>
            </td>
            <td className="border-separator border-b-[0.5px] px-3 py-2 whitespace-nowrap">
              <span className="flex items-center justify-between gap-3">
                {item.expiryDate && <span className="whitespace-nowrap">{formatDate(item.expiryDate, locale)}</span>}
                <UrgencyBadge urgency={urgencyOf(item, today)} locale={locale} />
              </span>
            </td>
            <td className="border-separator text-ink-2 border-b-[0.5px] px-3 py-2 whitespace-nowrap">
              {patternText(item, locale)}
            </td>
            <td className="border-separator text-ink-2 border-b-[0.5px] px-3 py-2 whitespace-nowrap">{item.cost}</td>
            <td className="border-separator border-b-[0.5px] p-0 text-center">
              <button
                type="button"
                aria-label={format(t(locale, 'media.deleteItem'), { title: item.name })}
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(item)
                }}
                className="text-danger inline-flex size-11 items-center justify-center rounded-md"
              >
                <TrashIcon />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
