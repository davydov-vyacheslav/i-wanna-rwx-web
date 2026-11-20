import { useEffect, useState } from 'react'
import { useMe, useSignedOut } from './features/identity/useMe'
import { useLocale, useSyncTimeZone } from './features/settings/useSettings'
import { AppIcon, LoginPage, panelClass } from './features/identity/LoginPage'
import { t } from './i18n'
import { AppShell } from './features/shell/AppShell'
import type { ApiClient } from './api/client'

export default function App({ api }: { api?: ApiClient }) {
  const { me, signedOut: meSignedOut, isError, isPending, refetch, isFetching } = useMe(api)
  const signedOut = useSignedOut() || meSignedOut
  const userId = signedOut ? undefined : me?.id
  useSyncTimeZone(userId, api)
  const locale = useLocale(api, !!userId)
  // read the one-shot ?error= once, then drop it from the URL
  const [error] = useState(() => new URLSearchParams(window.location.search).has('error'))
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.has('error')) {
      url.searchParams.delete('error')
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
    }
  }, [])

  if (isPending && !signedOut) {
    return (
      <main
        role="status"
        aria-label={t(locale, 'app.loading')}
        className={`${panelClass} bg-bg text-ink md:ml-[var(--sidebar-w)]`}
      >
        <AppIcon />
        <span
          aria-hidden="true"
          className="border-separator border-t-accent size-6 animate-spin rounded-full border-2 motion-reduce:animate-none"
        />
      </main>
    )
  }
  if (isError && !signedOut) {
    return (
      <main className="pt-safe pb-safe px-safe bg-bg text-ink flex min-h-dvh flex-col items-center justify-center gap-4">
        <p role="alert" className="text-body text-ink-2 text-center">
          {t(locale, 'app.unreachable')}
        </p>
        <button
          type="button"
          disabled={isFetching}
          onClick={() => void refetch()}
          className="bg-accent text-on-accent text-input min-h-11 rounded-md px-6 font-semibold disabled:opacity-60"
        >
          {t(locale, 'app.retry')}
        </button>
      </main>
    )
  }
  if (signedOut || !me) {
    return <LoginPage error={error} locale={locale} />
  }
  return <AppShell me={me} api={api} locale={locale} />
}
