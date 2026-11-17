import type { QueryClientConfig } from '@tanstack/react-query'

export const queryClientDefaults: QueryClientConfig = {
  defaultOptions: { queries: { networkMode: 'offlineFirst', staleTime: 30_000, retry: 1 } },
}
