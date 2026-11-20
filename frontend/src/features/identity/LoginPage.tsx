import { useEffect, useState, useSyncExternalStore } from 'react'
import { t, type Locale } from '../../i18n'
import { InstallSheet } from '../../pwa/InstallSheet'
import { useInstall } from '../../pwa/install'
import { DecorativeSidebar } from '../shell/AppShell'

const START_URL = '/oauth2/authorization/github'

/** The splash uses the same frame and icon, so splash to signed-out panel only adds what sits below the icon. */
export const panelClass =
  'pb-safe px-safe flex min-h-dvh min-w-0 flex-1 flex-col items-center justify-start gap-4 pt-[max(20dvh,env(safe-area-inset-top))]'

export function AppIcon() {
  return <img src="/icon-512.png" alt="" width={192} height={192} className="size-40 rounded-[22%] md:size-48" />
}

const subscribeOnline = (listener: () => void) => {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

const GitHubMark = () => (
  <svg aria-hidden="true" viewBox="0 0 16 16" width="20" height="20" fill="currentColor">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
  </svg>
)

/**
 * Signed out: the app shell without access. From `md` the decorative sidebar stands beside the panel; phones show
 * the panel alone. The location hash is never read or written here, a deep link is simply ignored.
 */
export function LoginPage({ error, locale }: { error?: boolean; locale: Locale }) {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine)
  const { mode, promptInstall } = useInstall()
  const [redirecting, setRedirecting] = useState(false)
  const [steps, setSteps] = useState(false)
  // Back from GitHub can restore this page from the bfcache with the click state still set
  useEffect(() => {
    const reset = () => setRedirecting(false)
    window.addEventListener('pageshow', reset)
    return () => window.removeEventListener('pageshow', reset)
  }, [])
  const blocked = !online || redirecting

  return (
    <div className="bg-bg text-ink flex min-h-dvh">
      <DecorativeSidebar locale={locale} />
      <main className={panelClass}>
        <h1 className="sr-only">RWX</h1>
        <AppIcon />
        <p className="text-sheet max-w-sm text-center font-semibold">{t(locale, 'login.required')}</p>
        <div aria-live="assertive" aria-atomic="true" className="w-full max-w-sm">
          {error && (
            <p role="alert" className="text-body text-danger bg-danger-bg rounded-md px-4 py-2 text-center">
              {t(locale, 'login.error')}
            </p>
          )}
        </div>
        {!online && (
          <p role="status" className="text-body text-warn bg-warn-bg w-full max-w-sm rounded-md px-4 py-2 text-center">
            {t(locale, 'login.offline')}
          </p>
        )}
        <a
          href={START_URL}
          aria-disabled={blocked || undefined}
          onClick={(e) => {
            if (blocked) e.preventDefault()
            else setRedirecting(true)
          }}
          className={`bg-ink text-bg text-input inline-flex min-h-12 w-full max-w-sm items-center justify-center gap-2 rounded-md px-6 text-center font-semibold ${blocked ? 'opacity-60' : ''}`}
        >
          {redirecting ? (
            <span
              aria-hidden="true"
              className="size-[18px] animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
            />
          ) : (
            <GitHubMark />
          )}
          {t(locale, 'login.signIn')}
        </a>
        <p className="text-foot text-ink-2 max-w-sm text-center">{t(locale, 'login.note')}</p>
        {(mode === 'prompt' || mode === 'ios-steps') && (
          <button
            type="button"
            onClick={() => (mode === 'prompt' ? void promptInstall() : setSteps(true))}
            className="text-accent text-body min-h-11 px-4 active:opacity-70"
          >
            {t(locale, mode === 'prompt' ? 'install.row.prompt' : 'install.row.ios')}
          </button>
        )}
        {steps && <InstallSheet locale={locale} onClose={() => setSteps(false)} />}
      </main>
    </div>
  )
}
