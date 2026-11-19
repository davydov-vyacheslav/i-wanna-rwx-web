import { useRef } from 'react'
import type { ApiClient } from '../../api/client'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { t, type Locale } from '../../i18n'
import { useDeleteAccount } from './useAccountData'

/** Permanent-deletion confirmation. Stays open with an inline error when the request fails. */
export function DeleteAccountDialog({
  api,
  locale,
  onCancel,
}: {
  api?: ApiClient
  locale: Locale
  onCancel: () => void
}) {
  const del = useDeleteAccount(api)
  // the query-state flag lags a tick behind a tap; this ref makes a double tap send one request
  const inFlight = useRef(false)
  function confirm() {
    if (inFlight.current) return
    inFlight.current = true
    del.mutate(undefined, { onSettled: () => (inFlight.current = false) })
  }
  return (
    <ConfirmDialog
      title={t(locale, 'settings.deleteTitle')}
      body={t(locale, 'settings.deleteBody')}
      confirmLabel={t(locale, 'settings.deleteConfirm')}
      cancelLabel={t(locale, 'settings.cancel')}
      pending={del.isPending}
      error={del.isError ? t(locale, 'settings.deleteFailed') : undefined}
      onConfirm={confirm}
      onCancel={onCancel}
    />
  )
}
