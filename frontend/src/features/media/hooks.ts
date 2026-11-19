import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { ApiClient } from '../../api/client'
import { isMediaError } from './errors'
import { createMediaRepository } from './repository'

export const BOOKS_KEY = ['media', 'books'] as const
export const MOVIES_KEY = ['media', 'movies'] as const

type Key = typeof BOOKS_KEY | typeof MOVIES_KEY
type Row = { id: string; version: number; updatedAt: string }

const refetching = {
  refetchOnMount: 'always',
  refetchOnWindowFocus: 'always',
  refetchOnReconnect: 'always',
} as const

// networkMode 'always': offline must fail fast to a toast, not pause the mutation (nothing is queued in this phase)
const mutationMode = { networkMode: 'always' } as const

function useRepo(api?: ApiClient) {
  return useMemo(() => createMediaRepository(api), [api])
}

/** Adds the stored row, or replaces the cached one when the response is not older. */
function upsert<T extends Row>(qc: QueryClient, key: Key, item: T) {
  qc.setQueryData<T[]>(key, (old) => {
    if (!old) return old
    const cur = old.find((x) => x.id === item.id)
    if (!cur) return [...old, item]
    return cur.version > item.version ? old : old.map((x) => (x.id === item.id ? item : x))
  })
}

function remove(qc: QueryClient, key: Key, id: string) {
  qc.setQueryData<Row[]>(key, (old) => old?.filter((x) => x.id !== id))
}

/** A 404/410 means the cached row is stale: let the server list replace it. */
function refetchIfStale(qc: QueryClient, key: Key, error: unknown) {
  if (isMediaError(error) && (error.kind === 'gone' || error.kind === 'not_found')) {
    void qc.invalidateQueries({ queryKey: key })
  }
}

/** Optimistic toggle: applies the patch to the cached row at once (bumping `updatedAt`); returns the row to restore. */
async function applyPatch<T extends Row>(qc: QueryClient, key: Key, id: string, patch: object) {
  await qc.cancelQueries({ queryKey: key })
  const previous = qc.getQueryData<T[]>(key)?.find((x) => x.id === id)
  const fields: Record<string, unknown> = { ...patch }
  delete fields.version // the row's version changes only with the server's answer
  qc.setQueryData<T[]>(key, (old) =>
    old?.map((x) => (x.id === id ? { ...x, ...fields, updatedAt: new Date().toISOString() } : x)),
  )
  return previous
}

/** A failed patch puts the previous row back (only that row) unless the row is stale, then the list is refetched. */
function rollbackPatch<T extends Row>(qc: QueryClient, key: Key, previous: T | undefined, error: unknown) {
  if (previous) qc.setQueryData<T[]>(key, (old) => old?.map((x) => (x.id === previous.id ? previous : x)))
  refetchIfStale(qc, key, error)
}

function useList<T>(key: Key, list: () => Promise<T[]>) {
  return useQuery({ queryKey: key, queryFn: list, ...refetching })
}

function useCreate<T extends Row, R>(key: Key, create: (item: R) => Promise<T>) {
  const qc = useQueryClient()
  return useMutation({
    ...mutationMode,
    mutationFn: create,
    onSuccess: (item) => upsert(qc, key, item),
  })
}

function useUpdate<T extends Row, P extends object>(key: Key, update: (id: string, patch: P) => Promise<T>) {
  const qc = useQueryClient()
  return useMutation({
    ...mutationMode,
    mutationFn: ({ id, patch }: { id: string; patch: P }) => update(id, patch),
    onMutate: ({ id, patch }) => applyPatch<T>(qc, key, id, patch),
    onSuccess: (item) => upsert(qc, key, item),
    onError: (error, _vars, previous) => rollbackPatch(qc, key, previous, error),
  })
}

function useDelete(key: Key, del: (id: string) => Promise<void>) {
  const qc = useQueryClient()
  return useMutation({
    ...mutationMode,
    mutationFn: del,
    onSuccess: (_void, id) => remove(qc, key, id),
    onError: (error) => refetchIfStale(qc, key, error),
  })
}

/** Preview of one provider entry; idle while `sourceUrl` is null. A failure is shown inline, never retried here. */
function useDetails<T>(
  type: 'books' | 'movies',
  sourceUrl: string | null,
  details: (url: string, signal: AbortSignal) => Promise<T>,
) {
  return useQuery({
    queryKey: ['details', type, sourceUrl],
    enabled: !!sourceUrl,
    retry: false,
    queryFn: ({ signal }) => details(sourceUrl!, signal),
  })
}

export function useBooks(api?: ApiClient) {
  return useList(BOOKS_KEY, useRepo(api).listBooks)
}
export function useCreateBook(api?: ApiClient) {
  return useCreate(BOOKS_KEY, useRepo(api).createBook)
}
export function useUpdateBook(api?: ApiClient) {
  return useUpdate(BOOKS_KEY, useRepo(api).updateBook)
}
export function useDeleteBook(api?: ApiClient) {
  return useDelete(BOOKS_KEY, useRepo(api).deleteBook)
}
export function useBookDetails(sourceUrl: string | null, api?: ApiClient) {
  return useDetails('books', sourceUrl, useRepo(api).getBookDetails)
}

export function useMovies(api?: ApiClient) {
  return useList(MOVIES_KEY, useRepo(api).listMovies)
}
export function useCreateMovie(api?: ApiClient) {
  return useCreate(MOVIES_KEY, useRepo(api).createMovie)
}
export function useUpdateMovie(api?: ApiClient) {
  return useUpdate(MOVIES_KEY, useRepo(api).updateMovie)
}
export function useDeleteMovie(api?: ApiClient) {
  return useDelete(MOVIES_KEY, useRepo(api).deleteMovie)
}
export function useMovieDetails(sourceUrl: string | null, api?: ApiClient) {
  return useDetails('movies', sourceUrl, useRepo(api).getMovieDetails)
}
