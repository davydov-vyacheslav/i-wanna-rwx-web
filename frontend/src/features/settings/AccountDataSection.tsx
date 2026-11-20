import { useState } from 'react'
import type { ApiClient } from '../../api/client'
import { t, type Locale } from '../../i18n'
import { Spinner } from '../../components/Spinner'
import { DeleteAccountDialog } from './DeleteAccountDialog'
import { SettingsGroup } from './SettingsGroup'
import { useExportData } from './useAccountData'

export function AccountDataSection({ api, locale }: { api?: ApiClient; locale: Locale }) {
  const exporter = useExportData(api)
  const [confirming, setConfirming] = useState(false)
  return (
    <SettingsGroup id="settings-data" title={t(locale, 'settings.data')}>
      <button
        type="button"
        disabled={exporter.isPending}
        aria-busy={exporter.isPending || undefined}
        onClick={() => exporter.mutate()}
        className="text-accent text-input min-h-11 w-full px-4 py-2 text-center focus-visible:outline-offset-[-2px] font-semibold active:opacity-70 disabled:opacity-60"
      >
        <span className="inline-flex items-center gap-2">
          {exporter.isPending && <Spinner />}
          {t(locale, exporter.isPending ? 'settings.exporting' : 'settings.export')}
        </span>
      </button>
      {exporter.isError && (
        <p role="alert" className="text-danger bg-danger-bg text-body px-4 py-2">
          {t(locale, 'settings.exportFailed')}
        </p>
      )}
      <div className="border-separator border-t-[0.5px]">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-danger text-input min-h-11 w-full px-4 py-2 text-center focus-visible:outline-offset-[-2px] font-bold active:opacity-70"
        >
          {t(locale, 'settings.delete')}
        </button>
      </div>
      {confirming && <DeleteAccountDialog api={api} locale={locale} onCancel={() => setConfirming(false)} />}
    </SettingsGroup>
  )
}
