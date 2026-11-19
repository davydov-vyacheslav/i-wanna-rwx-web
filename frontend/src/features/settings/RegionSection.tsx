import type { ApiClient } from '../../api/client'
import { t, type Locale } from '../../i18n'
import { LanguageRow } from './LanguageSection'
import { SettingsGroup } from './SettingsGroup'
import { TimezoneRows } from './TimezoneSection'

/** Language and timezone in one group: both are per-user regional settings stored in the settings record. */
export function RegionSection({
  userId,
  api,
  locale,
  deviceZone,
}: {
  userId: string
  api?: ApiClient
  locale: Locale
  deviceZone?: string
}) {
  return (
    <SettingsGroup id="settings-region" title={t(locale, 'settings.region')}>
      <LanguageRow api={api} locale={locale} />
      <div className="border-separator border-t-[0.5px]">
        <TimezoneRows userId={userId} api={api} locale={locale} deviceZone={deviceZone} />
      </div>
    </SettingsGroup>
  )
}
