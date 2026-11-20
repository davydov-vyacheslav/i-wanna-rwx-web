import type { ApiClient } from '../../api/client'
import { t, type Locale } from '../../i18n'
import type { Me } from '../identity/useMe'
import { AccountDataSection } from './AccountDataSection'
import { InstallSection } from './InstallSection'
import { AccountSection } from './AccountSection'
import { SourcesSection } from './SourcesSection'
import { RegionSection } from './RegionSection'

/**
 * Settings screen: one screen of grouped sections (Account, Sources, Language and timezone, App when installable, Account data). The host (App) provides the scroll container and safe areas.
 */
export function SettingsScreen({
  me,
  api,
  locale,
  deviceZone,
}: {
  me: Me
  api?: ApiClient
  locale: Locale
  deviceZone?: string
}) {
  return (
    <div className="text-ink px-4 pb-6">
      <h1 className="text-title pt-2 font-bold">{t(locale, 'settings.title')}</h1>
      <AccountSection me={me} api={api} locale={locale} />
      <SourcesSection api={api} locale={locale} />
      <RegionSection userId={me.id} api={api} locale={locale} deviceZone={deviceZone} />
      <InstallSection locale={locale} />
      <AccountDataSection api={api} locale={locale} />
    </div>
  )
}
