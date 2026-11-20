import { useState } from 'react'
import type { ApiClient } from '../../api/client'
import { Sheet } from '../../components/Sheet'
import { Spinner } from '../../components/Spinner'
import { t, type Locale } from '../../i18n'
import { format } from '../../i18n/format'
import { daysText, formatDate, patternText, UrgencyBadge } from './ReminderCard'
import { useRenewReminder } from './hooks'
import type { Reminder, ReminderType } from './types'
import type { Urgency } from './urgency'

/** `stacked`: the value sits under its label (a revealed key needs the full width). */
function Row({ label, stacked = false, children }: { label: string; stacked?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`border-separator flex min-h-11 justify-between gap-4 border-t-[0.5px] px-4 py-2 first:border-t-0 ${stacked ? 'flex-col' : 'items-center'}`}
    >
      <dt className="text-body text-ink-2 shrink-0">{label}</dt>
      <dd className={`text-body [overflow-wrap:anywhere] ${stacked ? '' : 'text-right'}`}>{children}</dd>
    </div>
  )
}

/**
 * Read-only view of one record with Renewed, Edit and Delete. The record comes from the list, so a renewal shows its new
 * date here as soon as the server's answer is in the cache. Renewed is only offered for the patterns that renew, sends the
 * date it shows and waits for the server.
 */
export function ReminderDetail({
  type,
  item,
  urgency,
  locale,
  api,
  inert,
  onClose,
  onEdit,
  onDelete,
  onRenewed,
  onRenewFailed,
}: {
  type: ReminderType
  item: Reminder
  urgency: Urgency
  locale: Locale
  api?: ApiClient
  /** The edit sheet is open above this one. */
  inert: boolean
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onRenewed: (message: string) => void
  onRenewFailed: (error: unknown) => void
}) {
  const renew = useRenewReminder(type, api)
  const [shown, setShown] = useState(false)
  const renewable =
    item.renewalPattern === 'monthly' || item.renewalPattern === 'yearly' || item.renewalPattern === 'custom'

  function renewNow() {
    if (!renewable || !item.expiryDate || renew.isPending) return
    renew
      .mutateAsync({ id: item.id, expectedExpiryDate: item.expiryDate })
      .then(
        (renewed) =>
          onRenewed(
            format(t(locale, 'reminders.renewed.toast'), { date: formatDate(renewed.expiryDate ?? '', locale) }),
          ),
        onRenewFailed,
      )
  }

  return (
    <Sheet
      title={t(locale, `reminders.detail.${type}`)}
      closeLabel={t(locale, 'media.close')}
      onClose={onClose}
      inert={inert}
    >
      <h3 className="text-title font-bold [overflow-wrap:anywhere]">{item.name}</h3>
      <div className="mt-1 flex">
        <UrgencyBadge urgency={urgency} locale={locale} />
      </div>
      <dl className="bg-surface mt-3 rounded-md">
        {item.expiryDate && (
          <Row label={t(locale, 'reminders.detail.expires')}>{formatDate(item.expiryDate, locale)}</Row>
        )}
        <Row label={t(locale, 'reminders.form.renewal')}>{patternText(item, locale)}</Row>
        {item.renewalPattern !== 'lifetime' && (
          <Row label={t(locale, 'reminders.detail.remind')}>{daysText(locale, item.remindDays)}</Row>
        )}
        {item.cost && <Row label={t(locale, 'reminders.form.cost')}>{item.cost}</Row>}
        {type === 'licenses' && item.licenseKey && (
          <Row label={t(locale, 'reminders.form.licenseKey')} stacked={shown}>
            <div className={`flex flex-col gap-1 ${shown ? 'items-start' : 'items-end'}`}>
              {/* a fixed run, so the masked row does not reveal the key's length */}
              <span className={shown ? 'font-mono whitespace-pre-wrap select-text' : 'tracking-widest'}>
                {shown ? item.licenseKey : '\u2022'.repeat(8)}
              </span>
              <button
                type="button"
                onClick={() => setShown(!shown)}
                className="text-accent text-body min-h-11 font-semibold"
              >
                {t(locale, shown ? 'reminders.key.hide' : 'reminders.key.reveal')}
              </button>
              <span aria-live="polite" className="sr-only">
                {t(locale, shown ? 'reminders.key.shown' : 'reminders.key.hidden')}
              </span>
            </div>
          </Row>
        )}
      </dl>
      {item.description && (
        <p className="text-body mt-3 whitespace-pre-line [overflow-wrap:anywhere]">{item.description}</p>
      )}

      <button
        type="button"
        aria-disabled={!renewable || undefined}
        aria-busy={renew.isPending || undefined}
        aria-describedby={renewable ? undefined : 'renew-note'}
        onClick={renewNow}
        className="bg-accent text-on-accent text-input mt-4 min-h-12 w-full rounded-md font-semibold aria-disabled:opacity-60"
      >
        <span className="inline-flex items-center justify-center gap-2">
          {renew.isPending && <Spinner />}
          {t(locale, 'reminders.renewed')}
        </span>
      </button>
      {!renewable && (
        <p id="renew-note" className="text-foot text-ink-2 mt-1">
          {t(locale, 'reminders.renewed.note')}
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setShown(false)
            onEdit()
          }}
          className="bg-surface-2 text-ink text-input min-h-11 flex-1 rounded-md font-semibold"
        >
          {t(locale, 'reminders.edit')}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="bg-danger-bg text-danger text-input min-h-11 flex-1 rounded-md font-semibold"
        >
          {t(locale, 'media.delete')}
        </button>
      </div>
    </Sheet>
  )
}
