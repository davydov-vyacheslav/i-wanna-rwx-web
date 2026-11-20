import { useMemo } from 'react'
import { DataTable, type DataColumn } from '../../components/DataTable'
import { t, type Locale } from '../../i18n'
import { formatDate, patternText, UrgencyBadge } from './ReminderCard'
import type { Subscription } from './types'
import { urgencyOf } from './urgency'

/** The reminders list for wide screens (expiry soonest first by default); Cost needs `lg`, at `md` Name keeps the room. */
export function RemindersTable({
  rows,
  today,
  locale,
  onOpen,
  onDelete,
  loading,
}: {
  rows: readonly Subscription[]
  today: string
  locale: Locale
  onOpen: (item: Subscription) => void
  onDelete: (item: Subscription) => void
  loading?: boolean
}) {
  const columns = useMemo<readonly DataColumn<Subscription>[]>(
    () => [
      {
        key: 'expiry',
        header: t(locale, 'reminders.detail.expires'),
        sort: (r) => r.expiryDate,
        width: 'w-64',
        cell: (r) => (
          <span className="flex items-center justify-between gap-3">
            {r.expiryDate && <span className="text-ink whitespace-nowrap">{formatDate(r.expiryDate, locale)}</span>}
            <UrgencyBadge urgency={urgencyOf(r, today)} locale={locale} />
          </span>
        ),
      },
      {
        key: 'renewal',
        header: t(locale, 'reminders.form.renewal'),
        sort: (r) => patternText(r, locale),
        // the first column to go when the screen is narrow: the name matters more
        hideBelow: 'lg',
        width: 'w-36',
        cell: (r) => patternText(r, locale),
      },
      {
        key: 'cost',
        header: t(locale, 'reminders.form.cost'),
        sort: (r) => r.cost,
        hideBelow: 'lg',
        width: 'w-28',
        cell: (r) => r.cost,
      },
    ],
    [locale, today],
  )
  const name = useMemo(
    () => ({ header: t(locale, 'reminders.form.name'), title: (r: Subscription) => r.name }),
    [locale],
  )

  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.id}
      name={name}
      columns={columns}
      locale={locale}
      onOpen={onOpen}
      onDelete={onDelete}
      loading={loading}
      loadingLabel={t(locale, 'reminders.loading')}
    />
  )
}
