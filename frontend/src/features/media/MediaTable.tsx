import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import type { ApiClient } from '../../api/client'
import { Cover } from '../../components/Cover'
import { DataTable, type DataColumn, type DataNameColumn } from '../../components/DataTable'
import { t, type Locale } from '../../i18n'
import { format } from '../../i18n/format'
import { useSettings } from '../settings/useSettings'
import { HeartIcon, StarIcon } from './icons'
import { formatRating, SourceBadge, StatusBadge, type ItemActions, type MediaLabels } from './MediaCard'
import { isDraft, type ListItem, type MediaKind } from './types'

type TableItem = ListItem & { year?: number; rating?: number }

/** What differs between the Books and Movies tables; a module constant per kind, so the columns stay memoized. */
export interface TableSpec<T> {
  kind: MediaKind
  labels: MediaLabels
  cover: (item: T) => string | undefined
  /** Adds the Author column (from `lg`; below it the author is the second line of the title). */
  author?: (item: T) => string | undefined
  /** Glyph and its screen-reader text, before the title. */
  typeIcon?: (item: T, locale: Locale) => ReactNode
  /** The series line under the title. */
  line?: (item: T, locale: Locale) => string | null
}

const control = 'flex items-center justify-center'

/** An empty value: a dash for the eye, the label for assistive technology. */
function Dash({ label }: { label?: string }) {
  return (
    <>
      <span aria-hidden="true">—</span>
      {label && <span className="sr-only">{label}</span>}
    </>
  )
}

/** The Books and Movies list for wide screens: the shared `DataTable` with the media columns (title A-Z by default). */
export function MediaTable<T extends TableItem>({
  rows,
  spec,
  locale,
  api,
  actions,
  loading,
}: {
  rows: readonly T[]
  spec: TableSpec<T>
  locale: Locale
  api?: ApiClient
  actions: ItemActions<T>
  loading?: boolean
}) {
  const { settings } = useSettings(api)
  const zone = settings?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  // the columns are memoized and their buttons must still call the current handlers
  const latest = useRef(actions)
  useLayoutEffect(() => {
    latest.current = actions
  })

  const columns = useMemo<readonly DataColumn<T>[]>(() => {
    const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: zone })
    const { author, labels } = spec
    return [
      ...(author
        ? [
            {
              key: 'author',
              header: t(locale, 'media.col.author'),
              sort: (r: T) => author(r) || undefined,
              hideBelow: 'lg',
              width: 'w-44',
              cell: (r: T) =>
                author(r) ? (
                  <span className="block max-w-40 truncate">{author(r)}</span>
                ) : (
                  <Dash label={t(locale, 'media.noAuthor')} />
                ),
            } satisfies DataColumn<T>,
          ]
        : []),
      {
        key: 'year',
        header: t(locale, 'media.col.year'),
        sort: (r) => r.year,
        first: 'desc',
        hideBelow: 'lg',
        width: 'w-20',
        cell: (r) => (r.year ? <span className="tabular-nums">{r.year}</span> : <Dash />),
      },
      {
        key: 'rating',
        header: t(locale, 'media.col.rating'),
        sort: (r) => r.rating || undefined,
        first: 'desc',
        hideBelow: 'lg',
        width: 'w-24',
        cell: (r) => {
          const text = formatRating(r.rating, locale)
          return text ? (
            <span className="flex items-center gap-1 tabular-nums">
              <span className="text-star">
                <StarIcon />
              </span>
              <span aria-label={format(t(locale, 'media.rating'), { value: text })}>{text}</span>
            </span>
          ) : (
            <Dash label={t(locale, 'media.noRating.sr')} />
          )
        },
      },
      {
        key: 'status',
        header: t(locale, 'media.col.status'),
        sort: (r) => (r.status === 'seen' ? 1 : 0),
        bare: true,
        width: 'w-36',
        cell: (r) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              latest.current.onToggleSeen(r)
            }}
            className={`${control} min-h-11 px-3`}
          >
            <StatusBadge status={r.status} locale={locale} seenKey={labels.seen} compact />
            <span className="sr-only">, {t(locale, r.status === 'seen' ? labels.markPlanned : labels.markSeen)}</span>
          </button>
        ),
      },
      {
        key: 'favorite',
        header: t(locale, 'media.favorite'),
        icon: (
          <span className="[&_svg]:size-4">
            <HeartIcon on={false} />
          </span>
        ),
        sort: (r) => (r.isFavorite ? 1 : 0),
        first: 'desc',
        align: 'center',
        bare: true,
        width: 'w-14',
        cell: (r) => (
          <button
            type="button"
            aria-label={t(locale, r.isFavorite ? 'media.unfavorite' : 'media.favorite')}
            onClick={(e) => {
              e.stopPropagation()
              latest.current.onToggleFavorite(r)
            }}
            className={`${control} size-11 ${r.isFavorite ? 'text-fav' : 'text-ink-2'}`}
          >
            <HeartIcon on={r.isFavorite === true} />
          </button>
        ),
      },
      {
        key: 'updated',
        header: t(locale, 'media.col.updated'),
        sort: (r) => Date.parse(r.updatedAt),
        first: 'desc',
        hideBelow: 'xl',
        width: 'w-36',
        cell: (r) => date.format(new Date(r.updatedAt)),
      },
    ]
  }, [locale, zone, spec])

  const name = useMemo<DataNameColumn<T>>(
    () => ({
      header: t(locale, 'media.col.title'),
      lead: (r) => <Cover src={spec.cover(r)} kind={spec.kind} width={42} height={56} />,
      prefix: (r) =>
        spec.typeIcon && (
          <span className={`mt-0.5 shrink-0 ${isDraft(r) ? 'text-draft' : 'text-accent'}`}>
            {spec.typeIcon(r, locale)}
          </span>
        ),
      title: (r) => r.title,
      sub: (r) => {
        const author = spec.author?.(r)
        const line = spec.line?.(r, locale)
        const draft = isDraft(r)
        if (!author && !line && !draft) return null
        return (
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 font-normal">
            {author && <span className="text-foot text-ink-2 truncate lg:hidden">{author}</span>}
            {line && <span className="text-foot text-ink-2 truncate">{line}</span>}
            {draft && <SourceBadge item={r} locale={locale} />}
          </span>
        )
      },
    }),
    [locale, spec],
  )

  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.id}
      name={name}
      columns={columns}
      locale={locale}
      onOpen={actions.onOpen}
      onDelete={actions.onDelete}
      loading={loading}
      loadingLabel={t(locale, 'media.loading')}
    />
  )
}
