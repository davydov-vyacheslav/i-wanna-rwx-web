import { t, type Locale } from '../../i18n'
import { format } from '../../i18n/format'
import type { Movie } from './types'

/**
 * Extra line for a series ("Status: Ended • 3 seasons") from whichever of tvStatus / seasonCount
 * is known; null for movies or when neither is known. One whole pattern per case, never joined parts.
 */
export function tvLine(movie: Pick<Movie, 'type' | 'tvStatus' | 'seasonCount'>, locale: Locale): string | null {
  if (movie.type !== 'tv') return null
  const n = movie.seasonCount && movie.seasonCount > 0 ? movie.seasonCount : undefined
  const one = n !== undefined && new Intl.PluralRules(locale).select(n) === 'one'
  const status = movie.tvStatus
    ? t(locale, movie.tvStatus === 'ended' ? 'media.tv.ended' : 'media.tv.ongoing')
    : undefined
  if (status && n !== undefined) return format(t(locale, one ? 'media.tv.line.one' : 'media.tv.line'), { status, n })
  if (status) return format(t(locale, 'media.tv.status'), { status })
  if (n !== undefined) return format(t(locale, one ? 'media.tv.seasons.one' : 'media.tv.seasons'), { n })
  return null
}
