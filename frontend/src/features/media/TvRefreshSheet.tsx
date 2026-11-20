import { useEffect, useMemo, useRef, useState } from 'react'
import type { ApiClient } from '../../api/client'
import { Sheet } from '../../components/Sheet'
import { Spinner } from '../../components/Spinner'
import { t, type Locale } from '../../i18n'
import { format } from '../../i18n/format'
import { useDataSources } from '../settings/useDataSources'
import { errorMessage, sourceLabels, type MessageOverrides } from './errorMessage'
import { isApiError } from '../../api/errors'
import { useUpdateMovie } from './hooks'
import { InlineNotice, NoticeAction } from './InlineNotice'
import { openSettings } from './openSettings'
import { createMediaRepository, type MovieDetails } from './repository'
import { isDraft, type Movie } from './types'

/** Wait before the one retry of a rate limit when the server sent no `Retry-After`. */
const BACKOFF_MS = 5000
/** A refresh stops on these (no "nothing was added" wording): the series written so far stay written. */
const REFRESH_ERRORS: MessageOverrides = {
  network: 'media.tvRefresh.error.network',
  timeout: 'media.tvRefresh.error.provider_timeout',
  provider_timeout: 'media.tvRefresh.error.provider_timeout',
  provider_error: 'media.tvRefresh.error.provider_error',
  rate_limited: 'media.tvRefresh.error.rate_limited',
  provider_rate_limited: 'media.tvRefresh.error.provider_rate_limited',
  server: 'media.tvRefresh.error.server',
}
/** Failures that concern one item only (it is skipped); anything else stops the run. A 400 on `sourceUrl` is one too. */
const SKIP = ['not_found', 'source_not_found']

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * "Refresh series status" (movies list menu): fetches details by the stored `externalLink` of every non-draft
 * series, one at a time, and writes `tvStatus`/`seasonCount` through the normal update only when they differ
 * and the new status is known. A rate limit (429 or the provider's 503) waits for `Retry-After` and retries once per series; a source key problem or any
 * other failure stops the run with a message in the sheet. Closing the sheet stops it.
 */
export function TvRefreshSheet({
  locale,
  movies,
  onClose,
  api,
}: {
  locale: Locale
  movies: readonly Movie[]
  onClose: () => void
  api?: ApiClient
}) {
  const repo = useMemo(() => createMediaRepository(api), [api])
  const update = useUpdateMovie(api)
  const dataSources = useDataSources(api)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ checked: number; updated: number } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const stopped = useRef(false)
  useEffect(() => {
    stopped.current = false
    return () => void (stopped.current = true)
  }, [])

  const keyMissing = isApiError(error) && error.kind === 'source_key_missing'
  const keyInvalid = isApiError(error) && error.kind === 'source_key_invalid'

  const labels = sourceLabels(dataSources.sources)

  async function details(url: string): Promise<MovieDetails> {
    try {
      return await repo.getMovieDetails(url)
    } catch (e) {
      if (!isApiError(e) || (e.kind !== 'rate_limited' && e.kind !== 'provider_rate_limited')) throw e
      await sleep(e.retryAfter !== undefined ? e.retryAfter * 1000 : BACKOFF_MS)
      return repo.getMovieDetails(url)
    }
  }

  async function run() {
    setRunning(true)
    setResult(null)
    setError(null)
    let checked = 0
    let updated = 0
    try {
      for (const m of movies.filter((x) => x.type === 'tv' && !isDraft(x))) {
        if (stopped.current) return
        let d: MovieDetails
        try {
          d = await details(m.externalLink)
        } catch (e) {
          if (isApiError(e) && (SKIP.includes(e.kind) || e.fieldErrors.some((f) => f.field === 'sourceUrl'))) continue
          throw e
        }
        checked++
        if (
          d.tvStatus &&
          (d.tvStatus !== m.tvStatus || (d.seasonCount !== undefined && d.seasonCount !== m.seasonCount))
        ) {
          await update.mutateAsync({
            id: m.id,
            patch: { tvStatus: d.tvStatus, seasonCount: d.seasonCount, version: m.version },
          })
          updated++
        }
      }
      if (!stopped.current) setResult({ checked, updated })
    } catch (e) {
      if (!stopped.current) setError(e)
    } finally {
      if (!stopped.current) setRunning(false)
    }
  }

  return (
    <Sheet title={t(locale, 'media.menu.open')} closeLabel={t(locale, 'media.close')} onClose={onClose}>
      {error !== null && (
        <InlineNotice
          message={
            keyMissing
              ? format(t(locale, 'media.tvRefresh.keyMissing'), {
                  source: labels[error.source ?? ''] ?? error.source ?? '',
                })
              : errorMessage(locale, error, labels, { overrides: REFRESH_ERRORS })
          }
        >
          {(keyMissing || keyInvalid) && (
            <NoticeAction
              label={t(locale, 'media.add.openSettings')}
              onClick={() => {
                onClose()
                openSettings()
              }}
            />
          )}
        </InlineNotice>
      )}
      <button
        type="button"
        disabled={running}
        onClick={() => void run()}
        className="bg-surface text-ink text-body mt-2 flex min-h-11 w-full items-center gap-3 rounded-md px-4 py-2 text-left font-semibold disabled:opacity-60"
      >
        <span className="flex-1">{t(locale, 'media.tvRefresh.action')}</span>
        {running && <Spinner />}
      </button>
      <p className="text-foot text-ink-2 mt-2">{t(locale, 'media.tvRefresh.hint')}</p>
      <p aria-live="polite" className="text-foot text-ink-2 mt-2 min-h-[18px]">
        {running
          ? t(locale, 'media.tvRefresh.running')
          : result
            ? format(t(locale, 'media.tvRefresh.result'), result)
            : ''}
      </p>
    </Sheet>
  )
}
