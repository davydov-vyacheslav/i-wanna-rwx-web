import createClient from 'openapi-fetch'
import type { paths } from './schema'

export interface ApiClientOptions {
  baseUrl?: string
  fetch?: typeof fetch
}

export function createApiClient(options: ApiClientOptions = {}) {
  return createClient<paths>({ baseUrl: options.baseUrl ?? '', fetch: options.fetch })
}

export type ApiClient = ReturnType<typeof createApiClient>

export const client: ApiClient = createApiClient()
