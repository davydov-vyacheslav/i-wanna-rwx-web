import { useState } from 'react'
import { detectLocale, t, type Locale } from '../../i18n'
import type { ApiClient } from '../../api/client'
import { useLogout, type Me } from './useMe'

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase()
}

/** Temporary home: GitHub login, avatar and Logout. Replaced by the lists in media-core. */
export function HomePage({ me, api, locale = detectLocale() }: { me: Me; api?: ApiClient; locale?: Locale }) {
  const logout = useLogout(api)
  const [broken, setBroken] = useState(false)
  return (
    <main className="pt-safe pb-safe px-safe bg-bg text-ink min-h-dvh">
      <h1 className="text-title font-bold">RWX</h1>
      <div className="mt-4 flex items-center gap-3">
        {me.avatarUrl && !broken ? (
          <img
            src={me.avatarUrl}
            alt=""
            width={44}
            height={44}
            className="size-11 rounded-full"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
          />
        ) : (
          <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-full bg-surface-2 font-bold">
            {initials(me.displayName)}
          </span>
        )}
        <p>
          <span className="block text-foot text-ink-2">{t(locale, 'home.signedInAs')}</span>
          <span className="font-semibold">{me.displayName}</span>
        </p>
      </div>
      <button
        type="button"
        disabled={logout.isPending}
        onClick={() => logout.mutate()}
        className="mt-6 bg-surface-2 text-ink text-input min-h-11 rounded-md px-4 font-semibold active:opacity-80 disabled:opacity-60"
      >
        {t(locale, 'home.logout')}
      </button>
      {logout.isError && (
        <p role="alert" className="text-danger bg-danger-bg text-body mt-3 rounded-md px-4 py-2">
          {t(locale, 'home.logoutFailed')}
        </p>
      )}
    </main>
  )
}
