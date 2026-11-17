import { detectLocale, t, type Locale } from '../../i18n'

const START_URL = '/oauth2/authorization/github'

export function LoginPage({
  error,
  locale = detectLocale(),
}: {
  error?: boolean
  locale?: Locale
}) {
  return (
    <main className="pt-safe pb-safe px-safe bg-bg text-ink flex min-h-dvh flex-col items-center justify-center gap-4">
      <h1 className="text-title font-bold">RWX</h1>
      <div aria-live="assertive" aria-atomic="true">
        {error && (
          <p role="alert" className="text-body text-danger bg-danger-bg rounded-md px-4 py-2 text-center">
            {t(locale, 'login.error')}
          </p>
        )}
      </div>
      <a
        href={START_URL}
        className="bg-accent text-on-accent text-input inline-flex min-h-11 items-center justify-center rounded-md px-6 font-semibold"
      >
        {t(locale, 'login.signIn')}
      </a>
    </main>
  )
}
