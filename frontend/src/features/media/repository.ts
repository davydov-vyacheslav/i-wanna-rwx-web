import { client as defaultClient, type ApiClient } from '../../api/client'
import type { components } from '../../api/schema'
import { call, callApi, errorFromResponse } from '../../api/errors'

/**
 * Create sends identity only: `{id, sourceUrl}` for every kind of entry (draft link or, from media-search on, a
 * provider URL). The server recognizes the source, resolves the item and returns the stored record; status and
 * favorite are never sent.
 */
type CreateBookRequest = components['schemas']['CreateBookRequest']
type CreateMovieRequest = components['schemas']['CreateMovieRequest']
/** Client-side limit for a create: the sheet stays open, the same id is retried. */
const CREATE_TIMEOUT_MS = 15_000

export type MovieDetails = components['schemas']['MovieDetails']

type UpdateBookRequest = components['schemas']['UpdateBookRequest']
type UpdateMovieRequest = components['schemas']['UpdateMovieRequest']

/**
 * The data seam for media: every call goes to the API through the shared client (CSRF header, 401 signal); the
 * The offline sync phase (roadmap phase 10) replaces the bodies with "write cache + outbox". Failures throw `ApiError`; nothing is queued.
 * `create*` resolves with the stored record for both 201 (created) and 200 (same id re-POSTed). `get*Details` take a
 * `sourceUrl` (a hit's link or a stored `externalLink`); display only, nothing is stored.
 */
export function createMediaRepository(api: ApiClient = defaultClient) {
  return {
    listBooks: () => callApi(() => api.GET('/api/v1/books')),
    createBook: (body: CreateBookRequest) =>
      callApi(() => api.POST('/api/v1/books', { body, signal: AbortSignal.timeout(CREATE_TIMEOUT_MS) })),
    updateBook: (id: string, body: UpdateBookRequest) =>
      callApi(() => api.PATCH('/api/v1/books/{id}', { params: { path: { id } }, body })),
    deleteBook: (id: string) =>
      call(async () => {
        const { error, response } = await api.DELETE('/api/v1/books/{id}', { params: { path: { id } } })
        if (!response.ok) throw errorFromResponse(response.status, error, response.headers)
      }),
    listMovies: () => callApi(() => api.GET('/api/v1/movies')),
    createMovie: (body: CreateMovieRequest) =>
      callApi(() => api.POST('/api/v1/movies', { body, signal: AbortSignal.timeout(CREATE_TIMEOUT_MS) })),
    updateMovie: (id: string, body: UpdateMovieRequest) =>
      callApi(() => api.PATCH('/api/v1/movies/{id}', { params: { path: { id } }, body })),
    deleteMovie: (id: string) =>
      call(async () => {
        const { error, response } = await api.DELETE('/api/v1/movies/{id}', { params: { path: { id } } })
        if (!response.ok) throw errorFromResponse(response.status, error, response.headers)
      }),
    getBookDetails: (sourceUrl: string, signal?: AbortSignal) =>
      callApi(() => api.GET('/api/v1/search/books/details', { params: { query: { sourceUrl } }, signal })),
    getMovieDetails: (sourceUrl: string, signal?: AbortSignal) =>
      callApi(() => api.GET('/api/v1/search/movies/details', { params: { query: { sourceUrl } }, signal })),
  }
}
