import { isMediaError, type MediaErrorKind } from './errors'
import { t, type Locale, type MessageKey } from '../../i18n'
import { format } from '../../i18n/format'

const KEYS: Partial<Record<MediaErrorKind, MessageKey>> = {
  duplicate: 'media.error.duplicate',
  gone: 'media.error.gone',
  not_found: 'media.error.not_found',
  network: 'media.error.network',
  source_not_found: 'media.error.source_not_found',
  source_key_missing: 'media.error.source_key_missing',
  source_key_invalid: 'media.error.source_key_invalid',
  source_key_rejected: 'media.error.source_key_rejected',
  rate_limited: 'media.error.rate_limited',
  provider_error: 'media.error.provider_error',
  provider_rate_limited: 'media.error.provider_rate_limited',
  provider_timeout: 'media.error.provider_timeout',
  timeout: 'media.error.provider_timeout',
}

/** Per-screen wording (search, series refresh) for the kinds whose default text talks about adding. */
export type MessageOverrides = Partial<Record<MediaErrorKind, MessageKey>>

/** Message key for a failed repository call; everything unlisted (400, 401, 403, 5xx) is the generic one. */
function errorMessageKey(error: unknown, overrides: MessageOverrides = {}): MessageKey {
  if (!isMediaError(error)) return overrides.server ?? 'media.error.server'
  return overrides[error.kind] ?? KEYS[error.kind] ?? overrides.server ?? 'media.error.server'
}

/**
 * Localized text for a failed call. `{source}` templates use the label from the cached data sources
 * (`labels`, by source id); an unknown id falls back to the raw id, and a problem without `source` to `fallbackSource`
 * (the label of the source the screen was using), never to a hard-coded name.
 */
export function errorMessage(
  locale: Locale,
  error: unknown,
  labels: Readonly<Record<string, string>> = {},
  { overrides, fallbackSource = '' }: { overrides?: MessageOverrides; fallbackSource?: string } = {},
): string {
  const text = t(locale, errorMessageKey(error, overrides))
  if (!isMediaError(error)) return text
  const id = error.source
  return format(text, { source: id ? (labels[id] ?? id) : fallbackSource })
}

/** Source id -> label, across both lists, for the `{source}` templates of `errorMessage`. */
export function sourceLabels(sources?: {
  books: { id: string; label: string }[]
  movies: { id: string; label: string }[]
}) {
  return Object.fromEntries([...(sources?.books ?? []), ...(sources?.movies ?? [])].map((s) => [s.id, s.label]))
}
