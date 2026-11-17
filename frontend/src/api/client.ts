import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './schema'

export interface ApiClientOptions {
  baseUrl?: string
  fetch?: typeof fetch
  /** Reads the CSRF token; defaults to the `XSRF-TOKEN` cookie. */
  csrfToken?: () => string | undefined
  /** Called on any 401 response (in addition to the global signed-out signal). */
  onUnauthorized?: () => void
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const CSRF_COOKIE = 'XSRF-TOKEN'
export const CSRF_HEADER = 'X-XSRF-TOKEN'

export function readCsrfCookie(cookie: string = document.cookie): string | undefined {
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === CSRF_COOKIE) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

type Listener = () => void
const listeners = new Set<Listener>()
let signedOut = false

/** Global signed-out signal: raised by any 401, cleared on a successful sign-in. */
export const authSignal = {
  isSignedOut: () => signedOut,
  raise() {
    if (signedOut) return
    signedOut = true
    listeners.forEach((l) => l())
  },
  reset() {
    if (!signedOut) return
    signedOut = false
    listeners.forEach((l) => l())
  },
  subscribe(l: Listener) {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
}

export function createApiClient(options: ApiClientOptions = {}) {
  const csrfToken = options.csrfToken ?? (() => readCsrfCookie())
  const api = createClient<paths>({ baseUrl: options.baseUrl ?? '', fetch: options.fetch })
  const middleware: Middleware = {
    onRequest({ request }) {
      if (SAFE_METHODS.has(request.method.toUpperCase())) return undefined
      const token = csrfToken()
      if (token) request.headers.set(CSRF_HEADER, token)
      return request
    },
    onResponse({ response }) {
      if (response.status === 401) {
        options.onUnauthorized?.()
        authSignal.raise()
      }
      return undefined
    },
  }
  api.use(middleware)
  return api
}

export type ApiClient = ReturnType<typeof createApiClient>

export const client: ApiClient = createApiClient()
