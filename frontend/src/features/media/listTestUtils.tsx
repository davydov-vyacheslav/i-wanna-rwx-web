import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ComponentType } from 'react'
import { createApiClient } from '../../api/client'
import type { Locale } from '../../i18n'
import { titleKey } from './duplicates'
import { draftLink } from './sourceUrl'
import { json } from '../../test/fixtures'

export const USER = 'user-1'
const base = {
  userId: USER,
  status: 'planned',
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
} as const
let n = 0
/** A fake list item with a unique id and title; `o` overrides any field. */
export function fake<T>(o: Partial<T> & Record<string, unknown> = {}): T {
  n++
  const item = {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    title: `Item ${n}`,
    ...base,
    source: 'draft',
    isFavorite: false,
    ...o,
  }
  // Drafts carry the title key and the Google link (as the server stores them); provider fixtures override both.
  return { externalId: titleKey(item.title), externalLink: draftLink(item.title), ...item } as T
}

/** Renders a list screen against an in-memory server for GET/PATCH/DELETE; returns the recorded calls. */
export function renderList(
  Screen: ComponentType<{ locale: Locale; userId?: string; api?: ReturnType<typeof createApiClient> }>,
  initial: { id: string }[],
  locale: Locale = 'en',
  respond?: (req: Request) => Response | Promise<Response> | undefined,
) {
  let items = [...initial]
  const calls: { method: string; path: string; body: unknown }[] = []
  const fetchFn: typeof fetch = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init)
    const path = new URL(req.url).pathname
    const body = req.method === 'PATCH' || req.method === 'POST' ? await req.clone().json() : undefined
    calls.push({ method: req.method, path, body })
    const custom = respond?.(req)
    if (custom) return custom
    if (req.method === 'GET') return json(items)
    if (req.method === 'POST') {
      // Like the server for a draft link: the title is the decoded `q`; movies are always type `movie`.
      const { id, sourceUrl } = body as { id: string; sourceUrl: string }
      const title = new URL(sourceUrl).searchParams.get('q') ?? ''
      const created = fake<{ id: string }>({ id, title, ...(path.endsWith('/movies') ? { type: 'movie' } : {}) })
      items = [...items, created]
      return json(created, 201)
    }
    const id = path.split('/').pop()
    if (req.method === 'PATCH') {
      items = items.map((x) =>
        x.id === id ? { ...x, ...(body as object), version: (x as unknown as { version: number }).version + 1 } : x,
      )
      return json(items.find((x) => x.id === id))
    }
    items = items.filter((x) => x.id !== id)
    return new Response(null, { status: 204 })
  }
  const api = createApiClient({ baseUrl: 'http://localhost', fetch: fetchFn, csrfToken: () => 'tok' })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={qc}>
      <Screen locale={locale} userId={USER} api={api} />
    </QueryClientProvider>,
  )
  return { calls, ...utils }
}
