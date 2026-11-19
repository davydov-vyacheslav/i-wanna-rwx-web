import { useState } from 'react'
import type { ApiClient } from '../../api/client'
import { t, type Locale } from '../../i18n'
import { useLogout, type Me } from '../identity/useMe'
import { SettingsGroup } from './SettingsGroup'

function initials(name: string): string {
  return Array.from(name.trim()).slice(0, 2).join('').toUpperCase()
}

export function Avatar({ url, name }: { url?: string | null; name: string }) {
  const [broken, setBroken] = useState<string | null>(null)
  if (url && broken !== url) {
    return (
      <img
        src={url}
        alt=""
        width={44}
        height={44}
        className="size-11 shrink-0 rounded-full"
        referrerPolicy="no-referrer"
        onError={() => setBroken(url)}
      />
    )
  }
  return (
    <span
      data-testid="avatar-initials"
      aria-hidden="true"
      className="bg-surface-2 flex size-11 shrink-0 items-center justify-center rounded-full font-bold"
    >
      {initials(name)}
    </span>
  )
}

export function AccountSection({ me, api, locale }: { me: Me; api?: ApiClient; locale: Locale }) {
  const logout = useLogout(api)
  return (
    <SettingsGroup id="settings-account" title={t(locale, 'settings.account')}>
      <div className="flex min-h-14 items-center gap-3 px-4 py-2">
        <Avatar url={me.avatarUrl} name={me.displayName} />
        <p className="min-w-0">
          <span className="text-foot text-ink-2 block">{t(locale, 'settings.signedInAs')}</span>
          <span className="block font-semibold break-words">{me.displayName}</span>
        </p>
      </div>
      <div className="border-separator border-t-[0.5px]">
        <button
          type="button"
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
          className="text-ink text-input min-h-11 w-full px-4 py-2 text-center active:opacity-70 disabled:opacity-60"
        >
          {t(locale, 'settings.signOut')}
        </button>
      </div>
      {logout.isError && (
        <p role="alert" className="text-danger bg-danger-bg text-body px-4 py-2">
          {t(locale, 'settings.signOutFailed')}
        </p>
      )}
    </SettingsGroup>
  )
}
