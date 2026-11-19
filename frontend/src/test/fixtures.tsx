import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createApiClient } from '../api/client'
import { LoginPage } from '../features/identity/LoginPage'
import { ME_KEY, useSignedOut, type Me } from '../features/identity/useMe'
import { SettingsScreen } from '../features/settings/SettingsScreen'
import { DATA_SOURCES_KEY, type DataSources } from '../features/settings/useDataSources'
import { SETTINGS_KEY, useLocale, type UserSettings } from '../features/settings/useSettings'

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

export const ME: Me = { id: 'u1', displayName: 'octo cat', avatarUrl: null }

export const settings = (over: Partial<UserSettings> = {}): UserSettings => ({
  userId: ME.id,
  timeZone: 'Europe/London',
  locale: 'en',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
})

/** One source per type, as the application registers them: Open Library, and TMDb with a saved key. */
export const SOURCES: DataSources = {
  books: [
    {
      id: 'open_library',
      label: 'Open Library',
      requiresKey: false,
      isDefault: true,
      isEffective: true,
      available: true,
      tokenSaved: false,
    },
  ],
  movies: [
    {
      id: 'tmdb',
      label: 'TMDb',
      requiresKey: true,
      isDefault: true,
      isEffective: true,
      available: true,
      tokenSaved: true,
    },
  ],
}

type Handler = (req: Request) => Response | Promise<Response>

/**
 * The Settings screen over a stubbed API with `/me`, `/settings` and the data sources already cached (nothing is
 * fetched on mount). `calls` records every other request, which `handler` answers: PATCH /settings, DELETE /me, GET /me/export, ...; after
 * a logout `GET /me` answers 401. A signed-out host shows the login page, like `App` does.
 */
export function mountSettings(
  handler: Handler = () => json(settings()),
  opts: { stored?: Partial<UserSettings>; deviceZone?: string; me?: Me } = {},
) {
  const me = opts.me ?? ME
  const current = settings(opts.stored)
  const calls: Request[] = []
  let loggedOut = false
  const api = createApiClient({
    baseUrl: 'http://localhost',
    csrfToken: () => 'tok',
    fetch: async (input, init) => {
      const req = new Request(input, init)
      const path = new URL(req.url).pathname
      const reading = req.method === 'GET' && (path === '/api/v1/me' || path === '/api/v1/settings')
      if (!reading) calls.push(req)
      if (path === '/api/v1/auth/logout') {
        loggedOut = true
        return new Response(null, { status: 204 })
      }
      if (reading && path === '/api/v1/me') return loggedOut ? json({ code: 'unauthorized' }, 401) : json(me)
      if (reading) return json(current)
      return handler(req)
    },
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  qc.setQueryData(ME_KEY, me)
  qc.setQueryData(DATA_SOURCES_KEY, SOURCES)
  qc.setQueryData(SETTINGS_KEY, current)
  function Host() {
    const locale = useLocale(api)
    if (useSignedOut()) return <LoginPage locale={locale} />
    return (
      <SettingsScreen me={qc.getQueryData<Me>(ME_KEY) ?? me} api={api} locale={locale} deviceZone={opts.deviceZone} />
    )
  }
  render(
    <QueryClientProvider client={qc}>
      <Host />
    </QueryClientProvider>,
  )
  return { calls, qc }
}
