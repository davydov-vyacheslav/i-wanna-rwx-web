import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CoverLink } from '../features/media/MediaCard'
import { Cover } from './Cover'

const firstImg = (c: HTMLElement) => c.querySelector('img')!

describe('Cover', () => {
  it('shows the image, decorative, sized, without a placeholder', () => {
    const { container } = render(<Cover src="https://img/x.jpg" kind="book" width={80} height={108} />)
    const img = firstImg(container)
    expect(img.getAttribute('src')).toBe('https://img/x.jpg')
    expect(img.getAttribute('alt')).toBe('')
    expect(img.getAttribute('width')).toBe('80')
    expect(img.getAttribute('height')).toBe('108')
    expect(container.querySelector('picture')).toBeNull()
  })

  it.each([
    ['book', 'book'],
    ['movie', 'movie'],
  ] as const)('without a src shows the %s art, light in the img and dark in the source', (kind, file) => {
    const { container } = render(<Cover kind={kind} width={42} height={56} />)
    const img = container.querySelector('picture img')!
    const source = container.querySelector('picture source')!
    expect(img.getAttribute('src')).toContain(`${file}-light`)
    expect(source.getAttribute('media')).toBe('(prefers-color-scheme: dark)')
    expect(source.getAttribute('srcset')).toContain(`${file}-dark`)
    expect(img.getAttribute('alt')).toBe('')
    expect(screen.queryAllByRole('img')).toHaveLength(0) // decorative: not exposed to assistive tech
  })

  it('falls back to the placeholder when the image fails, and tries again for a new src', () => {
    const { container, rerender } = render(<Cover src="https://img/x.jpg" kind="movie" width={80} height={108} />)
    fireEvent.error(firstImg(container))
    expect(container.querySelector('picture img')!.getAttribute('src')).toContain('movie-light')
    rerender(<Cover src="https://img/y.jpg" kind="movie" width={80} height={108} />)
    expect(firstImg(container).getAttribute('src')).toBe('https://img/y.jpg')
  })
})

describe('CoverLink', () => {
  it('links to the source page with a named link, new tab', () => {
    render(
      <CoverLink
        href="https://openlibrary.org/works/OL1W"
        title="Dune"
        kind="book"
        locale="en"
        width={80}
        height={108}
      />,
    )
    const a = screen.getByRole('link')
    expect(a.getAttribute('href')).toBe('https://openlibrary.org/works/OL1W')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('aria-label')).toContain('Dune')
  })

  it('is not a link without a vetted href', () => {
    const { container } = render(<CoverLink title="Dune" kind="book" locale="en" width={80} height={108} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.querySelector('picture')).not.toBeNull()
  })
})
