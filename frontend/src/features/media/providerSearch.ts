import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { client as defaultClient, type ApiClient } from '../../api/client'
import type { components } from '../../api/schema'
import { useDataSources } from '../settings/useDataSources'
import { callApi } from '../../api/errors'
import { MAX_DRAFT_CODE_POINTS } from './sourceUrl'

export type BookSearchHit = components['schemas']['BookSearchHit']
export type MovieSearchHit = components['schemas']['MovieSearchHit']
type BookSourceId = components['schemas']['BookSearchSourceId']
type MovieSourceId = components['schemas']['MovieSearchSourceId']

/** Provider search starts at this many characters (media spec); the upper bound is the draft text rule. */
export const SEARCH_MIN = 3
const SEARCH_DEBOUNCE_MS = 500

function useDebounced<T>(value: T): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [value])
  return debounced
}

/**
 * Shared by both types: debounced trimmed text of 3..200 characters, source in the query key, `source` left out
 * when it is the effective one (the server applies its own rule), so it waits for the data sources. TanStack aborts a superseded request through
 * `signal` and reports nothing for it.
 */
function useProviderSearch<S extends string, H>(
  type: 'books' | 'movies',
  q: string,
  sourceId: S,
  api: ApiClient,
  fetchHits: (q: string, source: S | undefined, signal: AbortSignal) => Promise<H[]>,
) {
  const live = q.trim()
  const text = useDebounced(live)
  const { sources } = useDataSources(api)
  const effective = sources?.[type].find((s) => s.isEffective)?.id
  const length = [...text].length
  const query = useQuery({
    queryKey: ['search', type, text, sourceId],
    enabled: !!sources && length >= SEARCH_MIN && length <= MAX_DRAFT_CODE_POINTS,
    retry: false,
    queryFn: ({ signal }) => fetchHits(text, sourceId === effective ? undefined : sourceId, signal),
  })
  // `stale`: the live text is ahead of the debounced one, so the data belongs to an earlier query
  return { ...query, stale: text !== live }
}

export function useSearchBooks(q: string, sourceId: BookSourceId, api: ApiClient = defaultClient) {
  return useProviderSearch('books', q, sourceId, api, (text, source, signal) =>
    callApi(() => api.GET('/api/v1/search/books', { params: { query: { q: text, source } }, signal })),
  )
}

export function useSearchMovies(q: string, sourceId: MovieSourceId, api: ApiClient = defaultClient) {
  return useProviderSearch('movies', q, sourceId, api, (text, source, signal) =>
    callApi(() => api.GET('/api/v1/search/movies', { params: { query: { q: text, source } }, signal })),
  )
}
