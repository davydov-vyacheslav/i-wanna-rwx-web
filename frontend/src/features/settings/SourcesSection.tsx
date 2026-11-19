import { useState } from 'react'
import type { ApiClient } from '../../api/client'
import { t, type Locale } from '../../i18n'
import { format } from '../../i18n/format'
import { Spinner } from '../../components/Spinner'
import { KeyDialog } from './KeyDialog'
import { SettingsGroup } from './SettingsGroup'
import { useDataSources, useSetDefaultDataSource, type DataSource, type ResourceType } from './useDataSources'

const GROUPS: { list: 'books' | 'movies'; type: ResourceType }[] = [
  { list: 'books', type: 'book' },
  { list: 'movies', type: 'movie' },
]

const rowBorder = 'border-separator border-t-[0.5px]'

/** Settings > Sources: per category the sources, the default and the write-only API key of sources that need one. */
export function SourcesSection({ api, locale }: { api?: ApiClient; locale: Locale }) {
  const query = useDataSources(api)
  const setDefault = useSetDefaultDataSource(api)
  const title = t(locale, 'sources.title')

  if (query.isPending) {
    return (
      <SettingsGroup id="settings-sources" title={title}>
        <div role="status" className="text-ink-2 text-body flex min-h-12 items-center gap-2 px-4">
          <Spinner />
          {t(locale, 'sources.loading')}
        </div>
      </SettingsGroup>
    )
  }
  if (!query.sources) {
    return (
      <SettingsGroup id="settings-sources" title={title}>
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 px-4 py-1">
          <p role="alert" className="text-danger text-body">
            {t(locale, 'sources.loadFailed')}
          </p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="text-accent text-input min-h-11 min-w-11 px-2 font-semibold active:opacity-70"
          >
            {t(locale, 'sources.retry')}
          </button>
        </div>
      </SettingsGroup>
    )
  }
  const lists = query.sources
  return (
    <SettingsGroup id="settings-sources" title={title}>
      {GROUPS.map(({ list, type }, gi) => {
        const items = lists[list]
        if (items.length === 0) return null
        const groupName = t(locale, list === 'books' ? 'sources.books' : 'sources.movies')
        const headingId = `settings-sources-${list}`
        const showDefault = items.length >= 2
        const groupFailed = setDefault.isError && setDefault.variables?.resourceType === type
        return (
          <div key={list} className={gi > 0 ? rowBorder : undefined}>
            <h3 id={headingId} className="text-foot text-ink-2 px-4 pt-3 pb-1 font-semibold">
              {groupName}
            </h3>
            <div
              role={showDefault ? 'radiogroup' : undefined}
              aria-label={showDefault ? format(t(locale, 'sources.defaultGroup'), { group: groupName }) : undefined}
            >
              {items.map((s, i) => (
                <SourceRow
                  key={s.id}
                  source={s}
                  type={type}
                  api={api}
                  locale={locale}
                  first={i === 0}
                  showDefault={showDefault}
                  busy={setDefault.isPending}
                  onChoose={() => setDefault.mutate({ resourceType: type, source: s.id })}
                />
              ))}
            </div>
            {groupFailed && (
              <p role="alert" className="text-danger bg-danger-bg text-body px-4 py-2">
                {t(locale, 'sources.defaultFailed')}
              </p>
            )}
          </div>
        )
      })}
    </SettingsGroup>
  )
}

function SourceRow({
  source,
  type,
  api,
  locale,
  first,
  showDefault,
  busy,
  onChoose,
}: {
  source: DataSource
  type: ResourceType
  api?: ApiClient
  locale: Locale
  first: boolean
  showDefault: boolean
  busy: boolean
  onChoose: () => void
}) {
  const [editing, setEditing] = useState(false)
  // the radio says which source is the default; the second line appears only when that default cannot be used
  const hint = showDefault && source.isDefault && !source.available
  const name = (
    <span className="flex min-w-0 flex-col">
      <span className="text-input">{source.label}</span>
      {hint && <span className="text-foot text-warn font-semibold">{t(locale, 'sources.defaultNeedsKey')}</span>}
    </span>
  )
  const ready = source.available || (source.requiresKey && source.tokenSaved)
  const state = (
    <span className={`inline-flex items-center gap-1.5 ${ready ? 'text-seen' : 'text-danger'}`}>
      {ready && (
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M7.5 12.5l3 3 6-6.5" />
        </svg>
      )}
      {ready ? t(locale, 'sources.available') : t(locale, 'sources.needsKey')}
    </span>
  )
  return (
    <div className={first ? undefined : rowBorder}>
      <div className="flex min-h-12 items-center">
        {showDefault ? (
          <button
            type="button"
            role="radio"
            aria-checked={source.isDefault}
            disabled={busy}
            onClick={() => {
              if (!source.isDefault) onChoose()
            }}
            className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-4 py-1 text-left active:opacity-70 disabled:opacity-60"
          >
            <span
              aria-hidden="true"
              className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                source.isDefault ? 'border-accent' : 'border-ink-2'
              }`}
            >
              {source.isDefault && <span className="bg-accent size-2.5 rounded-full" />}
            </span>
            {name}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center px-4 py-1">{name}</div>
        )}
        {source.requiresKey ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-foot text-ink-2 flex min-h-12 shrink-0 items-center gap-1 px-4 active:opacity-70"
          >
            {state}
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        ) : (
          <span className="text-foot flex shrink-0 items-center gap-1 px-4">
            {state}
            {/* same width as the chevron of the key rows, so every status lines up */}
            <span aria-hidden="true" className="w-3.5" />
          </span>
        )}
      </div>
      {editing && <KeyDialog source={source} type={type} api={api} locale={locale} onClose={() => setEditing(false)} />}
    </div>
  )
}
