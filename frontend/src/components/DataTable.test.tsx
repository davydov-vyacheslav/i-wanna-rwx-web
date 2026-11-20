import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataTable, type DataColumn } from './DataTable'

type Row = { id: string; name: string; year?: number; author?: string }

const ROWS: Row[] = [
  { id: '1', name: 'Dune', year: 1965, author: 'Herbert' },
  { id: '2', name: 'Emma', year: 2020 },
  { id: '3', name: 'Zen', author: 'Pirsig' },
]
const NAME = { header: 'Title', title: (r: Row) => r.name }
const COLUMNS: DataColumn<Row>[] = [
  { key: 'year', header: 'Year', width: 'w-20', sort: (r) => r.year, first: 'desc', cell: (r) => r.year },
  { key: 'author', header: 'Author', width: 'w-40', sort: (r) => r.author, hideBelow: 'lg', cell: (r) => r.author },
  { key: 'static', header: 'Static', width: 'w-16', cell: () => 'x' },
]

function mount(rows = ROWS, onOpen = vi.fn(), onDelete = vi.fn()) {
  const view = render(
    <DataTable
      rows={rows}
      rowKey={(r) => r.id}
      name={NAME}
      columns={COLUMNS}
      locale="en"
      onOpen={onOpen}
      onDelete={onDelete}
    />,
  )
  return { onOpen, onDelete, ...view }
}
const body = () => screen.getAllByRole('rowgroup')[1]!
const names = () =>
  within(body())
    .getAllByRole('row')
    .map((r) => within(r).getAllByRole('button')[0]!.textContent)
const header = (name: string) => screen.getByRole('button', { name })
const sortOf = (name: string) => screen.getByRole('columnheader', { name }).getAttribute('aria-sort')

afterEach(() => vi.restoreAllMocks())

describe('DataTable', () => {
  it('keeps the incoming order and sets no aria-sort until a header is used', () => {
    mount([ROWS[2]!, ROWS[0]!, ROWS[1]!])
    expect(names()).toEqual(['Zen', 'Dune', 'Emma'])
    for (const th of screen.getAllByRole('columnheader').slice(0, 4)) expect(th.getAttribute('aria-sort')).toBeNull()
  })

  it('an ascending-first column cycles ascending, descending, default', () => {
    mount([ROWS[2]!, ROWS[0]!, ROWS[1]!])
    fireEvent.click(header('Title'))
    expect(names()).toEqual(['Dune', 'Emma', 'Zen'])
    expect(sortOf('Title')).toBe('ascending')
    fireEvent.click(header('Title'))
    expect(names()).toEqual(['Zen', 'Emma', 'Dune'])
    expect(sortOf('Title')).toBe('descending')
    fireEvent.click(header('Title'))
    expect(names()).toEqual(['Zen', 'Dune', 'Emma'])
    expect(sortOf('Title')).toBeNull()
  })

  it('a descending-first column starts descending, and a missing value is last in both directions', () => {
    mount()
    fireEvent.click(header('Year'))
    expect(names()).toEqual(['Emma', 'Dune', 'Zen'])
    expect(sortOf('Year')).toBe('descending')
    fireEvent.click(header('Year'))
    expect(names()).toEqual(['Dune', 'Emma', 'Zen'])
    expect(sortOf('Year')).toBe('ascending')
    fireEvent.click(header('Year'))
    expect(names()).toEqual(['Dune', 'Emma', 'Zen'])
    expect(sortOf('Year')).toBeNull()
  })

  it('sorting another column replaces the sort; a column without a sort value has a disabled header', () => {
    mount()
    fireEvent.click(header('Year'))
    fireEvent.click(header('Author'))
    expect(sortOf('Year')).toBeNull()
    expect(sortOf('Author')).toBe('ascending')
    expect(names()).toEqual(['Dune', 'Zen', 'Emma'])
    expect((header('Static') as HTMLButtonElement).disabled).toBe(true)
  })

  it('hides a column below its breakpoint with CSS, not in the DOM', () => {
    mount()
    expect(screen.getByRole('columnheader', { name: 'Author' }).className).toContain('hidden lg:table-cell')
    expect(screen.getByRole('columnheader', { name: 'Year' }).className).not.toContain('hidden')
  })

  it('ArrowDown and ArrowUp move focus between the name buttons', () => {
    mount()
    const open = (n: string) => screen.getByRole('button', { name: n })
    open('Dune').focus()
    fireEvent.keyDown(open('Dune'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(open('Emma'))
    fireEvent.keyDown(open('Emma'), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(open('Dune'))
    fireEvent.keyDown(open('Dune'), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(open('Dune'))
  })

  it('a row opens the item; Delete asks for the delete and does not open it', () => {
    const { onOpen, onDelete } = mount()
    fireEvent.click(screen.getByText('Emma'))
    expect(onOpen).toHaveBeenCalledWith(ROWS[1])
    onOpen.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Dune' }))
    expect(onDelete).toHaveBeenCalledWith(ROWS[0])
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('a row click while text is selected does not open the item', () => {
    const { onOpen } = mount()
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'Her' } as Selection)
    fireEvent.click(screen.getByText('Herbert'))
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('a removed row fades out in place and is then gone', () => {
    vi.useFakeTimers()
    try {
      const { rerender } = mount()
      rerender(
        <DataTable
          rows={[ROWS[0]!, ROWS[2]!]}
          rowKey={(r) => r.id}
          name={NAME}
          columns={COLUMNS}
          locale="en"
          onOpen={vi.fn()}
          onDelete={vi.fn()}
        />,
      )
      expect(within(body()).getAllByRole('row')).toHaveLength(3)
      expect(within(body()).getAllByRole('row')[1]!.hasAttribute('inert')).toBe(true)
      act(() => void vi.advanceTimersByTime(250))
      expect(names()).toEqual(['Dune', 'Zen'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('a row that returns inside the fade window is shown once, not as a live row plus a ghost', () => {
    vi.useFakeTimers()
    try {
      const { rerender } = mount()
      const table = (rows: Row[]) => (
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          name={NAME}
          columns={COLUMNS}
          locale="en"
          onOpen={vi.fn()}
          onDelete={vi.fn()}
        />
      )
      rerender(table([ROWS[0]!, ROWS[2]!]))
      rerender(table([...ROWS]))
      expect(within(body()).getAllByRole('row')).toHaveLength(3)
      expect(
        within(body())
          .getAllByRole('row')
          .some((r) => r.hasAttribute('inert')),
      ).toBe(false)
      act(() => void vi.advanceTimersByTime(250))
      expect(names()).toEqual(['Dune', 'Emma', 'Zen'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('loading shows the header with disabled buttons and skeleton rows', () => {
    render(
      <DataTable
        rows={[]}
        rowKey={(r: Row) => r.id}
        name={NAME}
        columns={COLUMNS}
        locale="en"
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        loading
        loadingLabel="Loading"
      />,
    )
    expect(screen.getByRole('status').textContent).toBe('Loading')
    expect((header('Title') as HTMLButtonElement).disabled).toBe(true)
    expect(within(body()).getAllByRole('row', { hidden: true })).toHaveLength(6)
  })

  it('an icon column keeps its text for assistive technology, is centered and can drop the cell padding', () => {
    const columns: DataColumn<Row>[] = [
      {
        key: 'fav',
        width: 'w-14',
        header: 'Favorite',
        icon: <i data-testid="glyph" />,
        align: 'center',
        bare: true,
        sort: (r) => r.year,
        cell: () => 'x',
      },
    ]
    render(
      <DataTable
        rows={ROWS}
        rowKey={(r) => r.id}
        name={NAME}
        columns={columns}
        locale="en"
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    const th = screen.getByRole('columnheader', { name: 'Favorite' })
    expect(within(th).getByTestId('glyph').parentElement!.getAttribute('aria-hidden')).toBe('true')
    expect(within(th).getByText('Favorite').className).toBe('sr-only')
    expect(within(th).getByRole('button').className).toContain('justify-center')
    const cell = within(body()).getAllByText('x')[0]!.closest('td')!
    expect(cell.className).toContain('p-0')
    expect(cell.className).toContain('text-center')
  })

  it('shows the name prefix before the title inside the open button and a thumbnail block while loading', () => {
    const name = { ...NAME, lead: () => <b data-testid="thumb" />, prefix: () => <u>icon</u> }
    const { rerender } = render(
      <DataTable
        rows={ROWS}
        rowKey={(r) => r.id}
        name={name}
        columns={COLUMNS}
        locale="en"
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'iconDune' })).toBeTruthy()
    rerender(
      <DataTable
        rows={[]}
        rowKey={(r: Row) => r.id}
        name={name}
        columns={COLUMNS}
        locale="en"
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        loading
      />,
    )
    expect(body().querySelector('.h-14.w-\\[42px\\]')).toBeTruthy()
  })

  it('a click beside the name button focuses it, so a dialog returns focus there', () => {
    mount()
    fireEvent.click(screen.getByText('1965'))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Dune' }))
  })

  it('hands focus to the row that took the place of a removed one, else the previous one', () => {
    vi.useFakeTimers()
    try {
      const props = {
        rowKey: (r: Row) => r.id,
        name: NAME,
        columns: COLUMNS,
        locale: 'en' as const,
        onOpen: vi.fn(),
        onDelete: vi.fn(),
      }
      const { rerender } = render(<DataTable rows={ROWS} {...props} />)
      const remove = (rows: Row[], focus: string) => {
        act(() => screen.getByRole('button', { name: `Delete ${focus}` }).focus())
        rerender(<DataTable rows={rows} {...props} />)
        act(() => void vi.advanceTimersByTime(250))
      }
      remove([ROWS[0]!, ROWS[2]!], 'Emma')
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Zen' }))
      remove([ROWS[0]!], 'Zen')
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Dune' }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves focus alone when it is elsewhere', () => {
    vi.useFakeTimers()
    try {
      const props = {
        rowKey: (r: Row) => r.id,
        name: NAME,
        columns: COLUMNS,
        locale: 'en' as const,
        onOpen: vi.fn(),
        onDelete: vi.fn(),
      }
      const { rerender } = render(<DataTable rows={ROWS} {...props} />)
      const other = screen.getByRole('button', { name: 'Year' })
      act(() => other.focus())
      rerender(<DataTable rows={[ROWS[0]!, ROWS[2]!]} {...props} />)
      act(() => void vi.advanceTimersByTime(250))
      expect(document.activeElement).toBe(other)
    } finally {
      vi.useRealTimers()
    }
  })
})
