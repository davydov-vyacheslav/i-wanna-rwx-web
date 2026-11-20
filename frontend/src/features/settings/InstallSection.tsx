import { useState } from 'react'
import { t, type Locale } from '../../i18n'
import { InstallSheet } from '../../pwa/InstallSheet'
import { useInstall } from '../../pwa/install'
import { SettingsGroup } from './SettingsGroup'

/** Shown only where installing is possible and the app is not already installed. */
export function InstallSection({ locale }: { locale: Locale }) {
  const { mode, promptInstall } = useInstall()
  const [steps, setSteps] = useState(false)
  if (mode !== 'prompt' && mode !== 'ios-steps') return null
  return (
    <SettingsGroup id="settings-app" title={t(locale, 'install.group')}>
      <button
        type="button"
        onClick={() => (mode === 'prompt' ? void promptInstall() : setSteps(true))}
        className="min-h-12 w-full px-4 py-2 text-left focus-visible:outline-offset-[-2px] active:opacity-70"
      >
        <span className="text-accent text-input block font-semibold">
          {t(locale, mode === 'prompt' ? 'install.row.prompt' : 'install.row.ios')}
        </span>
        <span className="text-foot text-ink-2 block">{t(locale, 'install.row.note')}</span>
      </button>
      {steps && <InstallSheet locale={locale} onClose={() => setSteps(false)} />}
    </SettingsGroup>
  )
}
