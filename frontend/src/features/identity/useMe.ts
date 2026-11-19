import { useSyncExternalStore } from 'react'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authSignal, client as defaultClient, type ApiClient } from '../../api/client'
import type { components } from '../../api/schema'

export type Me = components['schemas']['Me']

export const ME_KEY = ['me'] as const

/** True after any API call returned 401. */
export function useSignedOut(): boolean {
  return useSyncExternalStore(authSignal.subscribe, authSignal.isSignedOut)
}

/** Current user; a 401 means signed out (`signedOut`), not an error to retry. */
export function useMe(api: ApiClient = defaultClient) {
  const query = useQuery({
    queryKey: ME_KEY,
    retry: false,
    queryFn: async (): Promise<Me | null> => {
      const { data, response } = await api.GET('/api/v1/me')
      if (response.status === 401) return null
      if (!data) throw new Error(`me ${response.status}`)
      authSignal.reset()
      return data
    },
  })
  return {
    ...query,
    me: query.data ?? undefined,
    signedOut: query.data === null,
  }
}

export function useLogout(api: ApiClient = defaultClient) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { response } = await api.POST('/api/v1/auth/logout')
      if (!response.ok) throw new Error(`logout ${response.status}`)
    },
    onSuccess: () => {
      qc.clear()
      authSignal.raise()
    },
  })
}
