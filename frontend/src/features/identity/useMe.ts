import { useEffect, useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authSignal, client as defaultClient, type ApiClient } from '../../api/client'
import type { components } from '../../api/schema'

export type Me = components['schemas']['Me']
export type UpdateMeRequest = components['schemas']['UpdateMeRequest']

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
  return { ...query, me: query.data ?? undefined, signedOut: query.data === null }
}

export function useUpdateMe(api: ApiClient = defaultClient) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: UpdateMeRequest) => {
      const { data, error, response } = await api.PATCH('/api/v1/me', { body })
      if (!data) throw new Error(`updateMe ${response.status} ${JSON.stringify(error)}`)
      return data
    },
    onSuccess: (me) => qc.setQueryData(ME_KEY, me),
  })
}

/** Sends the browser timezone once on open, only when it differs from the stored one. */
export function useSyncTimeZone(
  me: Me | undefined,
  api: ApiClient = defaultClient,
  browserZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  const { mutate } = useUpdateMe(api)
  const id = me?.id
  const stored = me?.timeZone
  useEffect(() => {
    if (id && browserZone && stored !== browserZone) mutate({ timeZone: browserZone })
    // once per signed-in user; a later server-side change must not trigger a resend
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
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
