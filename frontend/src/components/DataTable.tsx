import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { t, type Locale } from '../i18n'
import { format } from '../i18n/format'
import { ColumnSortIcon, TrashIcon } from '../features/media/icons'
import { focusQuietly } from './opener'

type Dir = 'asc' | 'desc'
type SortValue = string | number | null | undefined
type Sort = { key: string; dir: Dir }

export type DataColumn<R> = {
  key: string
  header: string
  /** A glyph shown in the header instead of the text, which stays for assistive technology (icon-only columns). */
  icon?: ReactNode
  /** Centers the header and the cells (icon columns). */
  align?: 'center'
  /** The cells hold a 44px control of their own, so they have no padding. */
  bare?: boolean
  /** The value rows are ordered by; a missing value is always last. Without it the column is not sortable. */
  sort?: (row: R) => SortValue
  /** The direction of the first click; ascending unless the best or newest value should come first. */
  first?: Dir
  /** Tailwind width class (`w-24`): the table is fixed-layout, so a column is as wide as this whatever its content. */
  width: string
  /** Below this width the column is hidden with CSS, never squeezed. */
  hideBelow?: 'lg' | 'xl'
  cell: (row: R) => ReactNode
}

/** The Name column, sorted by its title: the open button holds the title and the second line; the thumbnail sits outside it. */
export type DataNameColumn<R> = {
  header: string
  lead?: (row: R) => ReactNode
  /** Inline before the title, inside the open button (the type icon). */
  prefix?: (row: R) => ReactNode
  title: (row: R) => string
  sub?: (row: R) => ReactNode
}

const HIDE_BELOW = { lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' } as const
/** Rows with a thumbnail are all this tall (thumbnail 56px + 8px above and below), whatever the title or the second line holds. */
const ROW_HEIGHT = 'h-[72px]'
const FADE_MS = 220
const SKELETON_ROWS = 6

/**
 * The wide-screen list: one row per item, sortable by column. The incoming order is the default; a header click sorts in
 * the column's first direction, the next click in the opposite one, the third restores the default. The sort is
 * view state of this table. `rows` and `columns` must be stable between renders (memoized), as the leaving rows are found by
 * comparing the rows of consecutive renders.
 */
export function DataTable<R>({
  rows,
  rowKey,
  name,
  columns,
  locale,
  onOpen,
  onDelete,
  loading,
  loadingLabel,
}: {
  rows: readonly R[]
  rowKey: (row: R) => string
  name: DataNameColumn<R>
  columns: readonly DataColumn<R>[]
  locale: Locale
  onOpen: (row: R) => void
  onDelete: (row: R) => void
  /** Shows the header (inert) and skeleton rows instead of `rows`. */
  loading?: boolean
  loadingLabel?: string
}) {
  const [sort, setSort] = useState<Sort | null>(null)
  const body = useRef<HTMLTableSectionElement>(null)
  const sorted = useMemo(() => {
    if (!sort) return rows
    const value = sort.key === 'name' ? name.title : columns.find((c) => c.key === sort.key)?.sort
    if (!value) return rows
    const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true })
    const sign = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const x = value(a)
      const y = value(b)
      if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1
      return sign * (typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y)))
    })
  }, [rows, sort, locale, columns, name])

  // rows that left the list stay for the fade, at the position they had
  const [shown, setShown] = useState(sorted)
  const [leaving, setLeaving] = useState<readonly { row: R; at: number }[]>([])
  if (shown !== sorted) {
    setShown(sorted)
    const kept = new Set(sorted.map(rowKey))
    const gone = shown.flatMap((row, at) => (kept.has(rowKey(row)) ? [] : [{ row, at }]))
    if (gone.length > 0) setLeaving([...leaving, ...gone])
  }
  useEffect(() => {
    if (leaving.length === 0) return
    const timer = setTimeout(() => {
      // focus left with the row (it is inert while it fades): hand it to the row that took its place, else the previous one
      const active = document.activeElement
      const gone = body.current?.querySelector('tr[inert]')
      if (gone && (!active || active === document.body || active.closest('tr[inert]'))) {
        const live = (tr: Element | null, step: 'nextElementSibling' | 'previousElementSibling') => {
          while (tr?.hasAttribute('inert')) tr = tr[step]
          return tr
        }
        const near =
          live(gone.nextElementSibling, 'nextElementSibling') ??
          live(gone.previousElementSibling, 'previousElementSibling')
        focusQuietly(near?.querySelector<HTMLElement>('[data-open]'), { preventScroll: true })
      }
      setLeaving([])
    }, FADE_MS)
    return () => clearTimeout(timer)
  }, [leaving])

  const lines = sorted.map((row) => ({ row, gone: false }))
  // a row that came back inside the fade window is live again: no ghost twin with the same key
  const live = new Set(sorted.map(rowKey))
  for (const { row, at } of leaving) {
    if (!live.has(rowKey(row))) lines.splice(Math.min(at, lines.length), 0, { row, gone: true })
  }

  const click = (key: string, first: Dir = 'asc') =>
    setSort(
      sort?.key !== key
        ? { key, dir: first }
        : sort.dir === first
          ? { key, dir: first === 'asc' ? 'desc' : 'asc' }
          : null,
    )

  // plain Tab still works; the arrows are a shortcut between the open buttons of neighbouring rows
  const arrows = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const buttons = [...e.currentTarget.closest('tbody')!.querySelectorAll<HTMLElement>('tr:not([inert]) [data-open]')]
    buttons[buttons.indexOf(e.currentTarget) + (e.key === 'ArrowDown' ? 1 : -1)]?.focus()
    e.preventDefault()
  }

  const open = (row: R, line: HTMLElement) => {
    // dragging over the text to copy it must not open the item
    if (window.getSelection()?.toString()) return
    // the dialog returns focus to the name button, also when the row was clicked beside it
    focusQuietly(line.querySelector<HTMLElement>('[data-open]'))
    onOpen(row)
  }

  const headers: readonly Pick<
    DataColumn<R>,
    'key' | 'header' | 'icon' | 'align' | 'sort' | 'first' | 'hideBelow' | 'width'
  >[] = [{ key: 'name', header: name.header, sort: name.title, width: '' }, ...columns]
  return (
    <table className="bg-surface rounded-card text-body w-full table-fixed border-separate border-spacing-0 text-left">
      {loading && (
        <caption role="status" className="sr-only">
          {loadingLabel}
        </caption>
      )}
      <thead>
        <tr>
          {headers.map((c, i) => {
            const dir = sort?.key === c.key ? sort.dir : undefined
            const hide = c.hideBelow ? HIDE_BELOW[c.hideBelow] : ''
            return (
              <th
                key={c.key}
                scope="col"
                aria-sort={dir ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                className={`border-separator bg-surface text-foot sticky top-0 z-10 border-b-[0.5px] p-0 font-semibold ${i === 0 ? 'rounded-tl-card' : ''} ${dir ? 'text-ink' : 'text-ink-2'} ${c.width} ${hide}`}
              >
                <button
                  type="button"
                  disabled={loading || !c.sort}
                  onClick={() => click(c.key, c.first)}
                  className={`flex min-h-11 w-full items-center gap-1 px-3 text-left whitespace-nowrap -outline-offset-2 ${c.align === 'center' ? 'justify-center' : ''}`}
                >
                  {c.icon ? (
                    <>
                      <span aria-hidden="true">{c.icon}</span>
                      <span className="sr-only">{c.header}</span>
                    </>
                  ) : (
                    c.header
                  )}
                  <ColumnSortIcon dir={dir} />
                </button>
              </th>
            )
          })}
          <th
            scope="col"
            className="border-separator bg-surface rounded-tr-card sticky top-0 z-10 w-14 border-b-[0.5px]"
          >
            <span className="sr-only">{t(locale, 'media.delete')}</span>
          </th>
        </tr>
      </thead>
      <tbody ref={body} aria-busy={loading}>
        {loading
          ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <tr key={i} aria-hidden="true" className="animate-pulse motion-reduce:animate-none">
                <td className="border-separator border-b-[0.5px] px-3">
                  <div className={`flex items-center gap-3 ${name.lead ? ROW_HEIGHT : 'py-2'}`}>
                    {name.lead && <div className="bg-surface-2 h-14 w-[42px] shrink-0 rounded-sm" />}
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="bg-surface-2 h-4 w-3/4 rounded-full" />
                      {name.lead && <div className="bg-surface-2 h-3 w-1/2 rounded-full" />}
                    </div>
                  </div>
                </td>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`border-separator border-b-[0.5px] px-3 ${c.hideBelow ? HIDE_BELOW[c.hideBelow] : ''}`}
                  >
                    <div className={`bg-surface-2 h-3 rounded-full ${c.align === 'center' ? 'mx-auto w-5' : 'w-16'}`} />
                  </td>
                ))}
                <td className="border-separator border-b-[0.5px]" />
              </tr>
            ))
          : lines.map(({ row, gone }, i) => {
              const last = i === lines.length - 1
              const line = last ? '' : 'border-b-[0.5px]'
              const title = name.title(row)
              return (
                <tr
                  key={rowKey(row)}
                  inert={gone}
                  onClick={(e) => open(row, e.currentTarget)}
                  className={`hover:bg-surface-2 active:bg-surface-2 cursor-pointer ${gone ? 'pointer-events-none animate-[row-leave_220ms_forwards] motion-reduce:hidden' : ''}`}
                >
                  <td className={`border-separator min-w-0 p-0 ${line} ${last ? 'rounded-bl-card' : ''}`}>
                    <div className={`flex items-center gap-3 pl-3 ${name.lead ? ROW_HEIGHT : ''}`}>
                      {name.lead?.(row)}
                      <button
                        type="button"
                        data-open=""
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpen(row)
                        }}
                        onKeyDown={arrows}
                        className="text-ink flex max-h-full min-h-11 min-w-0 flex-1 flex-col justify-center overflow-hidden py-1 pr-3 text-left font-semibold -outline-offset-2"
                      >
                        <span className="flex items-start gap-1.5">
                          {name.prefix?.(row)}
                          <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]">{title}</span>
                        </span>
                        {name.sub?.(row)}
                      </button>
                    </div>
                  </td>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`border-separator text-ink-2 ${c.bare ? 'p-0' : 'truncate px-3 py-2'} ${c.align === 'center' ? 'text-center' : ''} ${line} ${c.hideBelow ? HIDE_BELOW[c.hideBelow] : ''}`}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                  <td className={`border-separator p-0 text-center ${line} ${last ? 'rounded-br-card' : ''}`}>
                    <button
                      type="button"
                      aria-label={format(t(locale, 'media.deleteItem'), { title })}
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(row)
                      }}
                      className="text-danger inline-flex size-11 items-center justify-center rounded-md"
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              )
            })}
      </tbody>
    </table>
  )
}
