import { useMemo, useState } from 'react'
import type { ApiClient } from '../../api/client'
import { t, type Locale } from '../../i18n'
import { SelectRow } from '../../components/SelectRow'
import { format } from '../../i18n/format'
import { ApiError, isTimeZoneChosen, markTimeZoneChosen, useSettings, useUpdateSettings } from './useSettings'
import { listTimeZones } from './timezones'

const zoneLabel = (z: string) => z.replaceAll('_', ' ')

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/**
 * The stored zone and the device zone can be missing from `Intl.supportedValuesOf` (ICU lists `Europe/Kiev`,
 * not `Europe/Kyiv`), so both are added as extra options when absent.
 */
export function zoneOptions(stored: string, device: string | undefined): string[] {
  const zones = listTimeZones()
  const extra = [stored, device].filter((z): z is string => !!z && !zones.includes(z))
  return extra.length ? [...zones.slice(0, 1), ...[...new Set([...zones.slice(1), ...extra])].sort()] : zones
}

export function TimezoneRows({
  userId,
  api,
  locale,
  deviceZone,
}: {
  userId: string
  api?: ApiClient
  locale: Locale
  deviceZone?: string
}) {
  const update = useUpdateSettings(api)
  const { settings } = useSettings(api)
  const loaded = settings !== undefined
  const stored = settings?.timeZone ?? 'UTC'
  const device = deviceZone ?? browserZone()
  const value = update.isPending && update.variables?.timeZone ? update.variables.timeZone : stored
  // re-render after "Keep UTC" (the flag lives in localStorage)
  const [, setKept] = useState(false)
  const keepUtcOffered = loaded && stored === 'UTC' && !!device && device !== 'UTC' && !isTimeZoneChosen(userId)
  const options = useMemo(() => zoneOptions(stored, device), [stored, device])

  function save(timeZone: string) {
    if (!loaded || timeZone === stored) return
    update.mutate(
      { timeZone },
      {
        onSuccess: () => {
          if (timeZone === 'UTC') markTimeZoneChosen(userId)
        },
      },
    )
  }

  const invalid = update.error instanceof ApiError && update.error.code === 'invalid_timezone'
  return (
    <>
      <SelectRow
        label={t(locale, 'settings.timezone')}
        value={value}
        disabled={!loaded || update.isPending}
        onChange={save}
      >
        {options.map((z) => (
          <option key={z} value={z}>
            {zoneLabel(z)}
          </option>
        ))}
      </SelectRow>
      {loaded && device && device !== stored && (
        <div className="border-separator border-t-[0.5px]">
          <button
            type="button"
            disabled={update.isPending}
            onClick={() => save(device)}
            className="text-accent text-input min-h-11 w-full px-4 py-2 text-center focus-visible:outline-offset-[-2px] font-semibold active:opacity-70 disabled:opacity-60"
          >
            {format(t(locale, 'settings.timezoneUseDevice'), { zone: zoneLabel(device) })}
          </button>
        </div>
      )}
      {keepUtcOffered && (
        <div className="border-separator border-t-[0.5px]">
          <button
            type="button"
            onClick={() => {
              markTimeZoneChosen(userId)
              setKept(true)
            }}
            className="text-accent text-input min-h-11 w-full px-4 py-2 text-center focus-visible:outline-offset-[-2px] font-semibold active:opacity-70"
          >
            {t(locale, 'settings.timezoneKeepUtc')}
          </button>
        </div>
      )}
      {update.isError && (
        <p role="alert" className="text-danger bg-danger-bg text-body px-4 py-2">
          {t(locale, invalid ? 'settings.timezoneInvalid' : 'settings.saveFailed')}
        </p>
      )}
    </>
  )
}
