import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { client as defaultClient, type ApiClient } from '../../api/client'
import type { components } from '../../api/schema'
import { detectLocale, type Locale } from '../../i18n'

export type UserSettings = components['schemas']['UserSettings']
export type UpdateSettingsRequest = components['schemas']['UpdateSettingsRequest']

export const SETTINGS_KEY = ['settings'] as const

/** Failed API call; `code` is the problem code of the response body (e.g. `invalid_timezone`) when present. */
export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** User settings (timezone, locale, push flag). Disable it until the user is known to be signed in. */
export function useSettings(api: ApiClient = defaultClient, enabled = true) {
  const query = useQuery({
    queryKey: SETTINGS_KEY,
    enabled,
    retry: false,
    queryFn: async (): Promise<UserSettings> => {
      const { data, response } = await api.GET('/api/v1/settings')
      if (!data) throw new Error(`settings ${response.status}`)
      return data
    },
  })
  return { ...query, settings: query.data }
}

export function useUpdateSettings(api: ApiClient = defaultClient) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: UpdateSettingsRequest) => {
      const { data, error, response } = await api.PATCH('/api/v1/settings', { body })
      if (!data) {
        const code = (error as { code?: unknown } | undefined)?.code
        throw new ApiError(
          `updateSettings ${response.status} ${JSON.stringify(error)}`,
          response.status,
          typeof code === 'string' ? code : undefined,
        )
      }
      return data
    },
    onSuccess: (settings) => qc.setQueryData(SETTINGS_KEY, settings),
  })
}

const TZ_CHOSEN_PREFIX = 'rwx.tz.chosen.'

/** Remembers on this device that the user explicitly picked a zone (notably `UTC`), so detection skips it. */
export function markTimeZoneChosen(userId: string): void {
  try {
    localStorage.setItem(TZ_CHOSEN_PREFIX + userId, '1')
  } catch {
    // storage unavailable: detection may run again, which is harmless
  }
}

export function isTimeZoneChosen(userId: string): boolean {
  try {
    return localStorage.getItem(TZ_CHOSEN_PREFIX + userId) === '1'
  } catch {
    return false
  }
}

/**
 * Sends the device timezone once per user and load, only while the stored zone is still the
 * default `UTC` and the device zone differs; never overwrites another stored zone. Waits for
 * the settings to load; does nothing if they fail to.
 */
export function useSyncTimeZone(
  userId: string | undefined,
  api: ApiClient = defaultClient,
  browserZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  const { settings } = useSettings(api, !!userId)
  const { mutate } = useUpdateSettings(api)
  const stored = settings?.timeZone
  const handled = useRef<string | undefined>(undefined)
  useEffect(() => {
    // once per signed-in user; a later server-side change must not trigger a resend
    if (!userId || stored === undefined || handled.current === userId) return
    handled.current = userId
    if (browserZone && stored === 'UTC' && browserZone !== 'UTC' && !isTimeZoneChosen(userId)) {
      mutate({ timeZone: browserZone })
    }
  }, [userId, stored, browserZone, mutate])
}

/** UI locale: the stored one (always set, fixed at sign-up); the device locale until settings load (or if they fail, or signed out). */
export function useLocale(api?: ApiClient, enabled = true): Locale {
  const { settings } = useSettings(api, enabled)
  return settings?.locale ?? detectLocale()
}
