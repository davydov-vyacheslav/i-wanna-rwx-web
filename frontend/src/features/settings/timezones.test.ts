import { afterEach, describe, expect, it, vi } from 'vitest'
import { listTimeZones } from './timezones'

afterEach(() => vi.unstubAllGlobals())

describe('listTimeZones', () => {
  it('includes UTC once, first', () => {
    const zones = listTimeZones()
    expect(zones[0]).toBe('UTC')
    expect(zones.filter((z) => z === 'UTC')).toHaveLength(1)
    expect(zones).toContain('Europe/London')
  })

  it('falls back to a short list when Intl.supportedValuesOf is missing', () => {
    vi.stubGlobal('Intl', { ...Intl, supportedValuesOf: undefined })
    const zones = listTimeZones()
    expect(zones[0]).toBe('UTC')
    expect(zones).toContain('Asia/Tokyo')
    expect(zones.length).toBeLessThan(50)
  })
})
