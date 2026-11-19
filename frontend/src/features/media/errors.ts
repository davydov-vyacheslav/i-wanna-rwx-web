import type { components } from '../../api/schema'

type Problem = components['schemas']['Problem']
export type DataSourceId = components['schemas']['DataSourceId']

export type MediaErrorKind =
  | 'duplicate' // 409, `existingId` is set
  | 'gone' // 410, the id was deleted
  | 'not_found' // 404, unknown or foreign id
  | 'validation' // 400, see `fieldErrors`
  | 'unauthorized' // 401 (the shared client also raises the signed-out signal)
  | 'forbidden' // 403, e.g. CSRF
  | 'source_not_found' // 422, the provider has no such item (nothing created, retry-safe)
  | 'source_key_missing' // 409 code source_key_missing (no key saved for `source`)
  | 'source_key_invalid' // 409 code source_key_invalid (the saved key was refused on use)
  | 'source_key_rejected' // 422 code source_key_rejected (key save refused; nothing stored)
  | 'rate_limited' // 429
  | 'provider_error' // 502
  | 'provider_rate_limited' // 503, `retryAfter` seconds when the header is present
  | 'provider_timeout' // 504 (server side)
  | 'timeout' // client-side request timeout (create: 15 s); retry with the same id
  | 'network' // fetch rejected: offline, DNS, aborted
  | 'server' // anything else

/** Typed failure of a repository call; UI maps `kind` to a toast. Nothing is queued on failure. */
export class MediaError extends Error {
  readonly kind: MediaErrorKind
  readonly status?: number
  readonly code?: string
  readonly existingId?: string
  /** Data source named by the problem (`Problem.source`), when the server sets it. */
  readonly source?: DataSourceId
  /** Seconds from a `Retry-After` header (503 provider_rate_limited), when sent. */
  readonly retryAfter?: number
  readonly fieldErrors: { field: string; message: string }[]

  constructor(
    kind: MediaErrorKind,
    init: { status?: number; problem?: Problem; cause?: unknown; retryAfter?: number } = {},
  ) {
    super(init.problem?.title ?? init.problem?.code ?? kind, { cause: init.cause })
    this.name = 'MediaError'
    this.kind = kind
    this.status = init.status
    this.code = init.problem?.code
    this.existingId = init.problem?.existingId
    this.source = init.problem?.source
    this.retryAfter = init.retryAfter
    this.fieldErrors = init.problem?.errors ?? []
  }
}

export function isMediaError(e: unknown): e is MediaError {
  return e instanceof MediaError
}

function asProblem(body: unknown): Problem | undefined {
  return body !== null && typeof body === 'object' ? (body as Problem) : undefined
}

function parseRetryAfter(headers?: Headers): number | undefined {
  const n = Number(headers?.get('Retry-After'))
  return Number.isFinite(n) && n >= 0 && headers?.get('Retry-After') ? n : undefined
}

export function errorFromResponse(status: number, body: unknown, headers?: Headers): MediaError {
  const problem = asProblem(body)
  const init = { status, problem, retryAfter: parseRetryAfter(headers) }
  switch (status) {
    case 400:
      return new MediaError('validation', init)
    case 401:
      return new MediaError('unauthorized', init)
    case 403:
      return new MediaError('forbidden', init)
    case 404:
      return new MediaError('not_found', init)
    case 409:
      if (problem?.code === 'source_key_missing') return new MediaError('source_key_missing', init)
      if (problem?.code === 'source_key_invalid') return new MediaError('source_key_invalid', init)
      if (problem?.code === 'duplicate') return new MediaError('duplicate', init)
      return new MediaError('server', init)
    case 410:
      return new MediaError('gone', init)
    case 422:
      if (problem?.code === 'source_key_rejected') return new MediaError('source_key_rejected', init)
      return new MediaError('source_not_found', init)
    case 429:
      return new MediaError('rate_limited', init)
    case 502:
      return new MediaError('provider_error', init)
    case 503:
      return new MediaError('provider_rate_limited', init)
    case 504:
      return new MediaError('provider_timeout', init)
    default:
      return new MediaError('server', init)
  }
}

/** Runs one API call; a rejected fetch becomes a `network` MediaError. */
export async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (cause) {
    if (isMediaError(cause)) throw cause
    const timedOut = (cause as { name?: unknown } | null)?.name === 'TimeoutError'
    throw new MediaError(timedOut ? 'timeout' : 'network', { cause })
  }
}

/** `call` for a request whose body is the answer: a missing `data` becomes the `MediaError` of the response. */
export function callApi<T>(request: () => Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  return call(async () => {
    const { data, error, response } = await request()
    if (!data) throw errorFromResponse(response.status, error, response.headers)
    return data
  })
}
