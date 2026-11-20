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
    <span className={`flex min-w-0 flex-col md:flex-row md:items-baseline md:gap-3 ${hint ? 'py-1.5 md:py-0' : ''}`}>
      <span className="text-input [overflow-wrap:anywhere] md:shrink-0">{source.label}</span>
      {hint && (
        <span className="text-foot text-warn font-semibold truncate">{t(locale, 'sources.defaultNeedsKey')}</span>
      )}
    </span>
  )
  const ready = source.available || (source.requiresKey && source.tokenSaved)
  const state = (
    <span className={`inline-flex items-center gap-1.5 ${ready ? 'text-seen' : 'text-danger'}`}>
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
        className={ready ? undefined : 'hidden md:block'}
      >
        <circle cx="12" cy="12" r="10" />
        {ready ? <path d="M7.5 12.5l3 3 6-6.5" /> : <path d="M12 7v6M12 16.5v.5" />}
      </svg>
      {ready ? t(locale, 'sources.available') : t(locale, 'sources.needsKey')}
    </span>
  )
  // md and up: one line, name | state | key button in grid columns; phones: state and chevron on the right, one tap target
  const action = t(locale, source.tokenSaved ? 'sources.keyReplace' : 'sources.keySave')
  return (
    <div className={first ? undefined : rowBorder}>
      <div className="flex min-h-16 items-center md:grid md:min-h-[52px] md:grid-cols-[1fr_9rem_3.5rem] lg:grid-cols-[1fr_10rem_3.5rem]">
        {showDefault ? (
          <label className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-4 py-1 active:opacity-70 has-[:disabled]:opacity-60 md:col-start-1">
            <input
              type="radio"
              name={`default-${type}`}
              checked={source.isDefault}
              disabled={busy}
              onChange={onChoose}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className={`peer-focus-visible:outline-accent flex size-5 shrink-0 items-center justify-center rounded-full border-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 ${
                source.isDefault ? 'border-accent' : 'border-ink-2'
              }`}
            >
              {source.isDefault && <span className="bg-accent size-2.5 rounded-full" />}
            </span>
            {name}
          </label>
        ) : (
          <div className="flex min-w-0 flex-1 items-center px-4 py-1 md:col-start-1">{name}</div>
        )}
        {source.requiresKey ? (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-foot text-ink-2 flex min-h-12 shrink-0 items-center gap-1 px-4 active:opacity-70 md:hidden"
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
            <span className="text-foot hidden md:col-start-2 md:flex">{state}</span>
            <button
              type="button"
              aria-label={format(t(locale, 'sources.keyAction'), { action, source: source.label })}
              title={action}
              onClick={() => setEditing(true)}
              className="text-accent hover:bg-surface-2 mr-3 hidden size-11 items-center justify-center justify-self-end rounded-md active:opacity-70 md:col-start-3 md:inline-flex"
            >
              <svg
                aria-hidden="true"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="8" cy="15" r="4" />
                <path d="M11 12l9-9M16 7l3 3M14 9l2 2" />
              </svg>
            </button>
          </>
        ) : (
          <span className="text-foot flex shrink-0 items-center gap-1 max-md:px-4 md:col-start-2">
            {state}
            {/* same width as the chevron of the key rows, so every status lines up */}
            <span aria-hidden="true" className="w-3.5 md:hidden" />
          </span>
        )}
      </div>
      {editing && <KeyDialog source={source} type={type} api={api} locale={locale} onClose={() => setEditing(false)} />}
    </div>
  )
}
