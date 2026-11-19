const FALLBACK = [
  'UTC',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Kyiv',
  'Europe/Warsaw',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
  'America/Sao_Paulo',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
]

/** IANA zones for the picker: `UTC` first, then the rest sorted; short fallback list on old browsers. */
export function listTimeZones(): string[] {
  let zones: string[]
  try {
    const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
    zones = supported ? supported('timeZone') : []
  } catch {
    zones = []
  }
  if (zones.length === 0) zones = FALLBACK
  return ['UTC', ...[...new Set(zones)].filter((z) => z !== 'UTC').sort()]
}
