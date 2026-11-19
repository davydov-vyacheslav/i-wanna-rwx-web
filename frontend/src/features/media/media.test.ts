import { describe, expect, it } from 'vitest'
import {
  activeCount,
  applyFilters,
  cycle,
  cycleFilter,
  defaultFilters,
  isFilterActive,
  resetFilters,
  selectType,
  showTypeButtons,
  type Filters,
} from './filters'
import { sortItems } from './sort'
import { applySearch, matchesSearch } from './search'
import { buildView, countLabel } from './counts'
import { findByIsbn, findByLink, normalizeIsbn, titleInLibrary, titleKey } from './duplicates'
import { coverTapUrl, draftLink, safeHttpsUrl } from './sourceUrl'
import type { Book, Movie } from './types'

let n = 0
function book(o: Partial<Book> = {}): Book {
  n++
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    userId: 'u',
    title: `Book ${n}`,
    status: 'planned',
    version: 1,
    source: 'draft',
    externalId: `book ${n}`,
    externalLink: `https://www.google.com/search?q=Book%20${n}`,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...o,
  }
}
function movie(o: Partial<Movie> = {}): Movie {
  n++
  return {
    id: `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    userId: 'u',
    title: `Movie ${n}`,
    type: 'movie',
    status: 'planned',
    version: 1,
    source: 'draft',
    externalId: `movie ${n}`,
    externalLink: `https://www.google.com/search?q=Movie%20${n}`,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...o,
  }
}
const titles = (xs: { title: string }[]) => xs.map((x) => x.title)

describe('filters', () => {
  it('cycles all -> include -> exclude -> all', () => {
    expect(cycle('all')).toBe('include')
    expect(cycle('include')).toBe('exclude')
    expect(cycle('exclude')).toBe('all')
    let f = defaultFilters()
    f = cycleFilter(f, 'favorite')
    expect(f.favorite).toBe('include')
    f = cycleFilter(cycleFilter(f, 'favorite'), 'favorite')
    expect(f.favorite).toBe('all')
  })

  it('default hides seen and counts as one active filter', () => {
    const f = defaultFilters()
    expect(f).toEqual({ type: 'all', favorite: 'all', seen: 'exclude', draft: 'all', ended: 'all' })
    expect(activeCount(f, 'book')).toBe(1)
    expect(isFilterActive(f)).toBe(true)
    const items = [book({ title: 'a' }), book({ title: 'b', status: 'seen' })]
    expect(titles(applyFilters(items, f, 'book'))).toEqual(['a'])
  })

  it('reset returns to the default from anything', () => {
    expect(resetFilters()).toEqual(defaultFilters())
  })

  it('badge counts seen + favorite = 2; all-all is inactive', () => {
    expect(activeCount({ ...defaultFilters(), favorite: 'include' }, 'book')).toBe(2)
    const none: Filters = { ...defaultFilters(), seen: 'all' }
    expect(activeCount(none)).toBe(0)
    expect(isFilterActive(none)).toBe(false)
  })

  it('badge counts type, draft and ended', () => {
    const f: Filters = { type: 'tv', favorite: 'include', seen: 'exclude', draft: 'exclude', ended: 'include' }
    expect(activeCount(f, 'movie')).toBe(5)
    // books have no type/ended
    expect(activeCount(f, 'book')).toBe(3)
  })

  it('favorite / seen / draft matching', () => {
    const items = [
      book({ title: 'fav', isFavorite: true, source: 'open_library', externalId: 'OL1W' }),
      book({ title: 'plain', source: 'open_library', externalId: 'OL2W' }),
      book({ title: 'draft' }),
      book({ title: 'seen', status: 'seen', source: 'open_library', externalId: 'OL3W' }),
    ]
    const all: Filters = { ...defaultFilters(), seen: 'all' }
    expect(titles(applyFilters(items, { ...all, favorite: 'include' }, 'book'))).toEqual(['fav'])
    expect(titles(applyFilters(items, { ...all, favorite: 'exclude' }, 'book'))).toEqual(['plain', 'draft', 'seen'])
    expect(titles(applyFilters(items, { ...all, draft: 'include' }, 'book'))).toEqual(['draft'])
    expect(titles(applyFilters(items, { ...all, draft: 'exclude' }, 'book'))).toEqual(['fav', 'plain', 'seen'])
    expect(titles(applyFilters(items, { ...all, seen: 'include' }, 'book'))).toEqual(['seen'])
  })

  it('type select is single, tapping again returns to all', () => {
    let f = selectType(defaultFilters(), 'tv')
    expect(f.type).toBe('tv')
    f = selectType(f, 'movie')
    expect(f.type).toBe('movie')
    f = selectType(f, 'movie')
    expect(f.type).toBe('all')
  })

  it('leaving series resets ended; staying keeps it', () => {
    let f = selectType(defaultFilters(), 'tv')
    f = cycleFilter(f, 'ended')
    expect(f.ended).toBe('include')
    expect(selectType(f, 'movie').ended).toBe('all')
    expect(selectType(f, 'tv').ended).toBe('all') // back to all type
  })

  it('type filter and ended filter (unknown matches exclude)', () => {
    const items = [
      movie({ title: 'film' }),
      movie({ title: 'ended', type: 'tv', tvStatus: 'ended' }),
      movie({ title: 'going', type: 'tv', tvStatus: 'ongoing' }),
      movie({ title: 'unknown', type: 'tv' }),
    ]
    const base: Filters = { ...defaultFilters(), seen: 'all' }
    expect(titles(applyFilters(items, { ...base, type: 'movie' }, 'movie'))).toEqual(['film'])
    expect(titles(applyFilters(items, { ...base, type: 'tv' }, 'movie'))).toEqual(['ended', 'going', 'unknown'])
    expect(titles(applyFilters(items, { ...base, type: 'tv', ended: 'include' }, 'movie'))).toEqual(['ended'])
    expect(titles(applyFilters(items, { ...base, type: 'tv', ended: 'exclude' }, 'movie'))).toEqual([
      'going',
      'unknown',
    ])
  })

  it('type buttons only when more than one type exists', () => {
    expect(showTypeButtons([movie(), movie()])).toBe(false)
    expect(showTypeButtons([movie(), movie({ type: 'tv' })])).toBe(true)
    expect(showTypeButtons([])).toBe(false)
  })
})

describe('sort', () => {
  it('titleAsc is case-insensitive: dune, Alien, Zodiac', () => {
    const items = ['dune', 'Alien', 'Zodiac'].map((title) => book({ title }))
    expect(titles(sortItems(items, 'titleAsc', 'en'))).toEqual(['Alien', 'dune', 'Zodiac'])
  })

  it('is numeric-aware', () => {
    const items = ['Part 10', 'Part 2', 'Part 1'].map((title) => book({ title }))
    expect(titles(sortItems(items, 'titleAsc', 'en'))).toEqual(['Part 1', 'Part 2', 'Part 10'])
  })

  it('sorts ru and uk titles by their alphabets, mixed case', () => {
    const ru = ['яблоко', 'Берег', 'арбуз', 'Война'].map((title) => book({ title }))
    expect(titles(sortItems(ru, 'titleAsc', 'ru'))).toEqual(['арбуз', 'Берег', 'Война', 'яблоко'])
    // uk: і sorts after и and before ї; ґ after г
    const uk = ['їжак', 'інжир', 'ґанок', 'гора', 'Ялинка'].map((title) => book({ title }))
    expect(titles(sortItems(uk, 'titleAsc', 'uk'))).toEqual(['гора', 'ґанок', 'інжир', 'їжак', 'Ялинка'])
  })

  it('ties (case-only difference) break by id and are stable', () => {
    const a = book({ id: 'b', title: 'Dune' })
    const b = book({ id: 'a', title: 'dune' })
    expect(sortItems([a, b], 'titleAsc', 'en').map((x) => x.id)).toEqual(['a', 'b'])
    expect(sortItems([b, a], 'titleAsc', 'en').map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('updatedDesc puts the newest first, ties by id', () => {
    const old = book({ title: 'old', updatedAt: '2026-01-01T00:00:00Z' })
    const mid = book({ title: 'mid', updatedAt: '2026-02-01T00:00:00Z' })
    const neu = book({ title: 'new', updatedAt: '2026-03-01T00:00:00Z' })
    expect(titles(sortItems([old, neu, mid], 'updatedDesc', 'en'))).toEqual(['new', 'mid', 'old'])
    const t1 = book({ id: 'b', updatedAt: '2026-03-01T00:00:00Z' })
    const t2 = book({ id: 'a', updatedAt: '2026-03-01T00:00:00Z' })
    expect(sortItems([t1, t2], 'updatedDesc', 'en').map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('does not mutate its input', () => {
    const items = ['b', 'a'].map((title) => book({ title }))
    sortItems(items, 'titleAsc', 'en')
    expect(titles(items)).toEqual(['b', 'a'])
  })
})

describe('search', () => {
  it('is a case-insensitive substring match on title', () => {
    expect(matchesSearch('Dune Messiah', 'dune', 'en')).toBe(true)
    expect(matchesSearch('Children of Dune', 'DUNE', 'en')).toBe(true)
    expect(matchesSearch('Alien', 'dune', 'en')).toBe(false)
  })

  it('blank query matches all', () => {
    expect(matchesSearch('x', '', 'en')).toBe(true)
    expect(matchesSearch('x', '   ', 'en')).toBe(true)
  })

  it('handles ru and uk mixed case', () => {
    expect(matchesSearch('Война и мир', 'ВОЙНА', 'ru')).toBe(true)
    expect(matchesSearch('Війна і мир', 'війна', 'uk')).toBe(true)
    expect(matchesSearch('Їжак у тумані', 'їЖАК', 'uk')).toBe(true)
    expect(matchesSearch('Война и мир', 'мир', 'ru')).toBe(true)
    expect(matchesSearch('Война и мир', 'тишина', 'ru')).toBe(false)
  })

  it('treats yo and ye as equal in both directions, nothing else', () => {
    expect(matchesSearch('Ёлка', 'елка', 'ru')).toBe(true)
    expect(matchesSearch('Елка', 'ёлка', 'ru')).toBe(true)
    expect(matchesSearch('Всё о нём', 'все о нем', 'ru')).toBe(true)
    expect(matchesSearch('Ёлка', 'ЁЛКА', 'ru')).toBe(true)
    expect(applySearch([book({ title: 'Ёлка' }), book({ title: 'Лес' })], 'елка', 'ru')).toHaveLength(1)
    expect(matchesSearch('Amélie', 'amelie', 'en')).toBe(false)
    expect(matchesSearch('Їжак', 'ижак', 'uk')).toBe(false)
  })

  it('matches composed and decomposed forms alike', () => {
    expect(matchesSearch('Amélie', 'amélie', 'en')).toBe(true)
  })

  it('searches the title only, not the author or description', () => {
    const items = [book({ title: 'Emma', author: 'Dune Writer', description: 'dune' })]
    expect(applySearch(items, 'dune', 'en')).toEqual([])
  })
})

describe('counts and view', () => {
  it('count label: none, total, narrowed', () => {
    expect(countLabel(0, 0)).toEqual({ kind: 'none' })
    expect(countLabel(40, 40)).toEqual({ kind: 'total', total: 40 })
    expect(countLabel(12, 40)).toEqual({ kind: 'narrowed', shown: 12, total: 40 })
    expect(countLabel(0, 5)).toEqual({ kind: 'narrowed', shown: 0, total: 5 })
  })

  const state = { filters: defaultFilters(), sort: 'titleAsc' as const, search: '' }

  it('40 books, 12 shown -> narrowed; default filter with no seen items -> plain total', () => {
    const items = Array.from({ length: 40 }, (_, i) => book({ title: `t${i}`, status: i < 28 ? 'seen' : 'planned' }))
    const v = buildView(items, state, 'book', 'en')
    expect(v.count).toEqual({ kind: 'narrowed', shown: 12, total: 40 })
    const unseen = items.map((i) => ({ ...i, status: 'planned' as const }))
    expect(buildView(unseen, state, 'book', 'en').count).toEqual({ kind: 'total', total: 40 })
  })

  it('search applies on top of filters (seen hidden + "dune")', () => {
    const items = [book({ title: 'Dune' }), book({ title: 'Dune Messiah', status: 'seen' }), book({ title: 'Alien' })]
    const v = buildView(items, { ...state, search: 'dune' }, 'book', 'en')
    expect(titles(v.items)).toEqual(['Dune'])
    expect(v.total).toBe(3)
    expect(v.count).toEqual({ kind: 'narrowed', shown: 1, total: 3 })
  })

  it('empty result is flagged; empty library shows no count', () => {
    const items = [book({ status: 'seen' })]
    const v = buildView(items, state, 'book', 'en')
    expect(v.empty).toBe(true)
    expect(v.total).toBe(1)
    expect(buildView([], state, 'book', 'en').count).toEqual({ kind: 'none' })
  })

  it('marking seen under updatedDesc moves it to the top if still visible', () => {
    const a = book({ title: 'a', updatedAt: '2026-01-01T00:00:00Z' })
    const b = book({ title: 'b', updatedAt: '2026-02-01T00:00:00Z' })
    const s = { filters: { ...defaultFilters(), seen: 'all' as const }, sort: 'updatedDesc' as const, search: '' }
    expect(titles(buildView([a, b], s, 'book', 'en').items)).toEqual(['b', 'a'])
    const a2 = { ...a, status: 'seen' as const, updatedAt: '2026-03-01T00:00:00Z' }
    expect(titles(buildView([a2, b], s, 'book', 'en').items)).toEqual(['a', 'b'])
  })
})

describe('duplicates', () => {
  it('normalizes ISBNs', () => {
    expect(normalizeIsbn('978-0-441-17271-9')).toBe('9780441172719')
    expect(normalizeIsbn('080442957x')).toBe('080442957X')
    expect(normalizeIsbn(' 0 8044 2957-x ')).toBe('080442957X')
  })

  it('findByIsbn: normalized equality, another ISBN or none does not match', () => {
    const existing = book({ isbn: '978-0-441-17271-9' })
    expect(findByIsbn('9780441172719', [existing])).toBe(existing)
    expect(findByIsbn('0441172717', [existing])).toBeUndefined()
    expect(findByIsbn(undefined, [existing])).toBeUndefined()
    expect(findByIsbn(' - ', [book({ isbn: ' ' })])).toBeUndefined()
  })

  it('findByLink: plain string equality with externalLink', () => {
    const existing = book({ externalLink: 'https://openlibrary.org/works/OL1W' })
    expect(findByLink('https://openlibrary.org/works/OL1W', [existing])).toBe(existing)
    expect(findByLink('https://openlibrary.org/works/OL1W/', [existing])).toBeUndefined()
  })

  it('titleInLibrary: case, spaces and NFD vs NFC; Cyrillic; yo and ye differ', () => {
    const dune = book({ title: 'Dune' })
    expect(titleInLibrary('  dUNE ', [dune])).toBe(dune)
    expect(titleInLibrary('Dune II', [dune])).toBeUndefined()
    const cafe = book({ title: 'Caf\u00e9' })
    expect(titleInLibrary('Cafe\u0301', [cafe])).toBe(cafe)
    const ru = book({ title: 'Война и мир' })
    expect(titleInLibrary('  война И МИР', [ru])).toBe(ru)
    const yo = book({ title: 'Ёлка' })
    expect(titleInLibrary('Елка', [yo])).toBeUndefined()
    expect(titleInLibrary('ёлка', [yo])).toBe(yo)
  })

  it('titleInLibrary: movies also match the original title; books ignore a missing one; blank matches nothing', () => {
    const m = movie({ title: 'Амели', originalTitle: 'Le Fabuleux Destin d\u2019Am\u00e9lie Poulain' })
    expect(titleInLibrary('le fabuleux destin d\u2019am\u00e9lie poulain', [m])).toBe(m)
    expect(titleInLibrary('x', [book()])).toBeUndefined()
    expect(titleInLibrary('  ', [book({ title: '' })])).toBeUndefined()
  })

  it('a draft in the library hides the draft entry too (same rule, any source)', () => {
    const draft = book({ title: 'My draft' })
    expect(titleInLibrary('my DRAFT', [draft])).toBe(draft)
  })
})

describe('source urls', () => {
  it("draftLink builds the Google link: space is %20, reserved and !'()* are encoded, NFC and trim", () => {
    expect(draftLink(' Dune & more ')).toBe('https://www.google.com/search?q=Dune%20%26%20more')
    expect(draftLink('a?b#c')).toBe('https://www.google.com/search?q=a%3Fb%23c')
    expect(draftLink("!'()*")).toBe('https://www.google.com/search?q=%21%27%28%29%2A')
    expect(draftLink('Война и мир \u{1F600}')).toBe(
      'https://www.google.com/search?q=%D0%92%D0%BE%D0%B9%D0%BD%D0%B0%20%D0%B8%20%D0%BC%D0%B8%D1%80%20%F0%9F%98%80',
    )
    expect(draftLink('Cafe\u0301')).toBe(draftLink('Caf\u00e9'))
  })

  it.each([
    ['blank', '   '],
    ['empty', ''],
    ['NUL', 'a\u0000b'],
    ['newline', 'a\nb'],
    ['tab', 'a\tb'],
    ['DEL', 'a\u007Fb'],
    ['C1 control', 'a\u0085b'],
    ['replacement character', 'a\uFFFDb'],
    ['201 code points', 'a'.repeat(201)],
    ['201 emoji', '\u{1F600}'.repeat(201)],
  ])('draftLink rejects %s', (_name, text) => {
    expect(draftLink(text)).toBeUndefined()
  })

  it('draftLink accepts 200 code points, the ZWJ sequence and NBSP padding', () => {
    expect(draftLink('\u{1F600}'.repeat(200))).toBeDefined()
    expect(draftLink('\u{1F468}\u200D\u{1F469}')).toBe(
      'https://www.google.com/search?q=%F0%9F%91%A8%E2%80%8D%F0%9F%91%A9',
    )
    expect(draftLink('\u00a0Dune\u00a0')).toBe('https://www.google.com/search?q=Dune')
  })

  it('safeHttpsUrl accepts only https without credentials', () => {
    expect(safeHttpsUrl('https://openlibrary.org/works/OL1W')).toBe('https://openlibrary.org/works/OL1W')
    expect(safeHttpsUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeHttpsUrl('http://example.com')).toBeUndefined()
    expect(safeHttpsUrl('https://user:pw@example.com')).toBeUndefined()
    expect(safeHttpsUrl('not a url')).toBeUndefined()
    expect(safeHttpsUrl(undefined)).toBeUndefined()
  })

  it('coverTapUrl: the stored https link (the Google link for a draft), nothing otherwise', () => {
    expect(coverTapUrl({ externalLink: 'https://www.google.com/search?q=Dune' })).toBe(
      'https://www.google.com/search?q=Dune',
    )
    expect(coverTapUrl({ externalLink: 'javascript:alert(1)' })).toBeUndefined()
    expect(coverTapUrl({ externalLink: 'http://example.com' })).toBeUndefined()
    expect(coverTapUrl({})).toBeUndefined()
  })

  it('titleKey is idempotent', () => {
    for (const t of ['  Dune ', 'Ёлка', 'Cafe\u0301']) expect(titleKey(titleKey(t))).toBe(titleKey(t))
  })
})
