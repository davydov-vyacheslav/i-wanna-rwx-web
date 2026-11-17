import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { authSignal, createApiClient } from './api/client'
import { LoginPage } from './features/identity/LoginPage'
import { t, type Locale } from './i18n'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function renderApp(status: number) {
  const api = createApiClient({
    baseUrl: 'http://localhost',
    fetch: () =>
      Promise.resolve(
        status === 200
          ? json({ id: '11111111-1111-1111-1111-111111111111', displayName: 'octo', timeZone: 'UTC' })
          : json({ code: 'unauthorized' }, status),
      ),
  })
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <App api={api} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  authSignal.reset()
  window.history.replaceState(null, '', '/')
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

  it('signed in shows the shell, not the login button', async () => {
    renderApp(200)
    await screen.findByRole('heading', { name: 'RWX' })
    expect(screen.queryByRole('link')).toBeNull()
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
      fetch: () =>
        fail
          ? Promise.reject(new TypeError('network'))
          : Promise.resolve(json({ id: '11111111-1111-1111-1111-111111111111', displayName: 'octo', timeZone: 'UTC' })),
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
    await screen.findByRole('heading', { name: 'RWX' })
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

describe('home', () => {
  it('shows login name, logout posts with CSRF then shows login and closes the db', async () => {
    const calls: Request[] = []
    const api = createApiClient({
      baseUrl: 'http://localhost',
      csrfToken: () => 'tok',
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const req = new Request(input, init)
        calls.push(req)
        if (req.url.endsWith('/auth/logout')) return Promise.resolve(new Response(null, { status: 204 }))
        return Promise.resolve(
          json({ id: '22222222-2222-2222-2222-222222222222', displayName: 'octo', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
        )
      },
    })
    const { openDb } = await import('./db/db')
    const closed: string[] = []
    const spy = vi.spyOn(Dexie.prototype, 'close').mockImplementation(function (this: Dexie) {
      closed.push(this.name)
    })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App api={api} />
      </QueryClientProvider>,
    )
    await screen.findByText('octo')
    void openDb
    fireEvent.click(screen.getByRole('button', { name: t('en', 'home.logout') }))
    await screen.findByRole('link', { name: t('en', 'login.signIn') })
    const out = calls.find((c) => c.url.endsWith('/auth/logout'))!
    expect(out.method).toBe('POST')
    expect(out.headers.get('X-XSRF-TOKEN')).toBe('tok')
    expect(closed).toContain('rwx-22222222-2222-2222-2222-222222222222')
    spy.mockRestore()
  })
})
