import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { client as defaultClient, type ApiClient } from '../../api/client'
import type { components } from '../../api/schema'
import { ApiError } from './useSettings'

export type DataSources = components['schemas']['DataSources']
export type DataSource = components['schemas']['DataSource']
export type DataSourceId = components['schemas']['DataSourceId']
export type ResourceType = components['schemas']['ResourceType']

export const DATA_SOURCES_KEY = ['data-sources'] as const

/** Problem codes the Sources UI tells apart; any other code is `unknown`. */
export type SourceErrorKind =
  | 'source_key_rejected'
  | 'source_key_invalid'
  | 'source_key_missing'
  | 'provider_timeout'
  | 'provider_error'
  | 'provider_rate_limited'
  | 'rate_limited'
  | 'validation'
  | 'offline'
  | 'unknown'

const KINDS: readonly SourceErrorKind[] = [
  'source_key_rejected',
  'source_key_invalid',
  'source_key_missing',
  'provider_timeout',
  'provider_error',
  'provider_rate_limited',
  'rate_limited',
  'validation',
  'offline',
]

/** Failed data-source call: `kind` is the problem `code`, `source` the source the problem names (`Problem.source`). */
export class DataSourceError extends ApiError {
  readonly kind: SourceErrorKind
  readonly source?: string
  constructor(message: string, status: number, code?: string, source?: string) {
    super(message, status, code)
    this.kind = KINDS.find((k) => k === code) ?? 'unknown'
    this.source = source
  }
}

/** Key writes fail fast offline (no queued mutation that would hold the key in memory). */
function assertOnline(op: string) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    throw new DataSourceError(`${op} offline`, 0, 'offline')
}

function toError(op: string, error: unknown, status: number): DataSourceError {
  const p = (error ?? {}) as { code?: unknown; source?: unknown }
  // never include the body in the message: it is not expected to hold a key, but nothing sensitive is logged
  return new DataSourceError(
    `${op} ${status}`,
    status,
    typeof p.code === 'string' ? p.code : undefined,
    typeof p.source === 'string' ? p.source : undefined,
  )
}

/** Both lists (books, movies) of the user's data sources. */
export function useDataSources(api: ApiClient = defaultClient, enabled = true) {
  const query = useQuery({
    queryKey: DATA_SOURCES_KEY,
    enabled,
    retry: false,
    queryFn: async (): Promise<DataSources> => {
      const { data, error, response } = await api.GET('/api/v1/data-sources')
      if (!data || !Array.isArray(data.books) || !Array.isArray(data.movies))
        throw toError('listDataSources', error, response.status)
      return data
    },
  })
  return { ...query, sources: query.data }
}

export interface SourceRef {
  resourceType: ResourceType
  source: DataSourceId
}

/** Each mutation puts the returned lists into the cache (no refetch). */
export function useSetDefaultDataSource(api: ApiClient = defaultClient) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ resourceType, source }: SourceRef) => {
      const { data, error, response } = await api.PUT('/api/v1/data-sources/{resourceType}/{source}/default', {
        params: { path: { resourceType, source } },
      })
      if (!data) throw toError('setDefaultDataSource', error, response.status)
      return data
    },
    onSuccess: (lists) => qc.setQueryData(DATA_SOURCES_KEY, lists),
  })
}

export function useSaveSourceKey(api: ApiClient = defaultClient) {
  const qc = useQueryClient()
  return useMutation({
    // never paused offline, and nothing (the key is in the variables) stays in the MutationCache
    networkMode: 'always',
    gcTime: 0,
    mutationFn: async ({ resourceType, source, apiKey }: SourceRef & { apiKey: string }) => {
      assertOnline('saveDataSourceKey')
      const { data, error, response } = await api.PUT('/api/v1/data-sources/{resourceType}/{source}/key', {
        params: { path: { resourceType, source } },
        body: { apiKey },
      })
      if (!data) throw toError('saveDataSourceKey', error, response.status)
      return data
    },
    onSuccess: (lists) => qc.setQueryData(DATA_SOURCES_KEY, lists),
  })
}

export function useDeleteSourceKey(api: ApiClient = defaultClient) {
  const qc = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: async ({ resourceType, source }: SourceRef) => {
      assertOnline('deleteDataSourceKey')
      const { data, error, response } = await api.DELETE('/api/v1/data-sources/{resourceType}/{source}/key', {
        params: { path: { resourceType, source } },
      })
      if (!data) throw toError('deleteDataSourceKey', error, response.status)
      return data
    },
    onSuccess: (lists) => qc.setQueryData(DATA_SOURCES_KEY, lists),
  })
}
