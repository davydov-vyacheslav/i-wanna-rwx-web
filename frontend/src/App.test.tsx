import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { json } from './test/fixtures'
import { authSignal, createApiClient } from './api/client'
import { LoginPage } from './features/identity/LoginPage'
import { t, type Locale } from './i18n'

/** Answers per URL: /me (or `me`'s status), settings, logout; anything else 404. */
function server(
  me: () => Response,
  calls: Request[] = [],
  settings: () => Response = () => json(SETTINGS),
): typeof fetch {
  return (input, init) => {
    const req = new Request(input, init)
    calls.push(req)
    const path = new URL(req.url).pathname
    if (path === '/api/v1/me') return Promise.resolve(req.method === 'GET' ? me() : json({}))
    if (path === '/api/v1/settings') return Promise.resolve(req.method === 'GET' ? settings() : json(SETTINGS))
    if (path === '/api/v1/auth/logout') return Promise.resolve(new Response(null, { status: 204 }))
    return Promise.resolve(json({ code: 'not_found' }, 404))
  }
}

const ME = { id: '11111111-1111-1111-1111-111111111111', displayName: 'octo' }
const SETTINGS = {
  userId: ME.id,
  timeZone: 'UTC',
  locale: 'en',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

function renderApp(status: number) {
  const api = createApiClient({
    baseUrl: 'http://localhost',
    fetch: server(() => (status === 200 ? json(ME) : json({ code: 'unauthorized' }, status))),
  })
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <App api={api} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  authSignal.reset()
  localStorage.clear()
  // the signed-in tests below look at the Settings tab; the shell test starts from Books
  window.history.replaceState(null, '', '/#/settings')
})

describe('auth gate', () => {
  it('401 shows only the login button', async () => {
    renderApp(401)
    const link = await screen.findByRole('link', { name: t('en', 'login.signIn') })
    expect(link.getAttribute('href')).toBe('/oauth2/authorization/github')
    expect(screen.queryAllByRole('link')).toHaveLength(1)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('signed in shows the shell on Books, not the login button', async () => {
    window.history.replaceState(null, '', '/')
    renderApp(200)
    await screen.findByRole('heading', { name: 'Books', level: 1 })
    expect(screen.getAllByRole('navigation', { name: t('en', 'nav.label') })).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: t('en', 'nav.settings') })[0]!)
    await screen.findByRole('heading', { name: t('en', 'settings.title') })
    expect(screen.queryByRole('link', { name: t('en', 'login.signIn') })).toBeNull()
  })

  it('shows loading while /me is pending', () => {
    renderApp(401)
    expect(screen.getByRole('status')).toBeTruthy()
  })
})

describe('/me failures', () => {
  it('network failure shows retry, not login; retry refetches', async () => {
    let fail = true
    const api = createApiClient({
      baseUrl: 'http://localhost',
      fetch: (input, init) => (fail ? Promise.reject(new TypeError('network')) : server(() => json(ME))(input, init)),
    })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App api={api} />
      </QueryClientProvider>,
    )
    expect((await screen.findByRole('alert')).textContent).toBe(t('en', 'app.unreachable'))
    expect(screen.queryByRole('link', { name: t('en', 'login.signIn') })).toBeNull()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: t('en', 'app.retry') }))
    await screen.findByRole('heading', { name: t('en', 'settings.title') })
  })

  it('500 shows the error state', async () => {
    renderApp(500)
    expect((await screen.findByRole('alert')).textContent).toBe(t('en', 'app.unreachable'))
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('url and html lang', () => {
  it('clears error from the URL', async () => {
    window.history.replaceState(null, '', '/lists?x=1&error')
    renderApp(401)
    expect(window.location.search).toBe('?x=1')
    expect((await screen.findByRole('alert')).textContent).toBe(t('en', 'login.error'))
  })

  it('sets documentElement.lang from the detected locale', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['uk-UA'])
    renderApp(401)
    expect(document.documentElement.lang).toBe('uk')
    vi.restoreAllMocks()
  })
})

describe('effective locale', () => {
  const withLocale = (locale: string) =>
    createApiClient({
      baseUrl: 'http://localhost',
      fetch: server(
        () => json(ME),
        [],
        () => json({ ...SETTINGS, timeZone: 'Europe/London', locale }),
      ),
    })
  const mount = (api: ReturnType<typeof createApiClient>) =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App api={api} />
      </QueryClientProvider>,
    )

  it('stored uk on an English device renders Ukrainian', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US'])
    mount(withLocale('uk'))
    await screen.findByRole('heading', { name: t('uk', 'settings.title') })
    expect(document.documentElement.lang).toBe('uk')
    vi.restoreAllMocks()
  })
})

describe('settings failing', () => {
  it('falls back to the device locale and still shows the app', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ru-RU'])
    const api = createApiClient({
      baseUrl: 'http://localhost',
      fetch: server(
        () => json(ME),
        [],
        () => json({ code: 'boom' }, 500),
      ),
    })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App api={api} />
      </QueryClientProvider>,
    )
    await screen.findByRole('heading', { name: t('ru', 'settings.title') })
    vi.restoreAllMocks()
  })
})

describe('login errors', () => {
  for (const locale of ['en', 'ru', 'uk'] as Locale[]) {
    it(`generic message in ${locale}`, () => {
      render(<LoginPage error locale={locale} />)
      expect(screen.getByRole('alert').textContent).toBe(t(locale, 'login.error'))
      expect(screen.getByRole('link', { name: t(locale, 'login.signIn') })).toBeTruthy()
    })
  }

  it('App reads ?error= from the location', async () => {
    window.history.replaceState(null, '', '/login?error')
    renderApp(401)
    expect((await screen.findByRole('alert')).textContent).toBe(t('en', 'login.error'))
    expect(screen.getByRole('link').getAttribute('href')).toBe('/oauth2/authorization/github')
  })
})

describe('settings screen', () => {
  it('shows the login name, sign out posts with CSRF then shows login', async () => {
    const calls: Request[] = []
    const api = createApiClient({
      baseUrl: 'http://localhost',
      csrfToken: () => 'tok',
      fetch: server(
        () => json(ME),
        calls,
        () => json({ ...SETTINGS, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      ),
    })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App api={api} />
      </QueryClientProvider>,
    )
    await screen.findByText('octo')
    fireEvent.click(screen.getByRole('button', { name: t('en', 'settings.signOut') }))
    await screen.findByRole('link', { name: t('en', 'login.signIn') })
    const out = calls.find((c) => c.url.endsWith('/auth/logout'))!
    expect(out.method).toBe('POST')
    expect(out.headers.get('X-XSRF-TOKEN')).toBe('tok')
  })
})
