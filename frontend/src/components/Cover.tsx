import { useState } from 'react'
import bookDark from '../assets/covers/book-dark.png'
import bookLight from '../assets/covers/book-light.png'
import movieDark from '../assets/covers/movie-dark.png'
import movieLight from '../assets/covers/movie-light.png'
import type { MediaKind } from '../features/media/types'

const PLACEHOLDERS = {
  book: { light: bookLight, dark: bookDark },
  movie: { light: movieLight, dark: movieDark },
}

/**
 * A cover image, or the placeholder art when there is no `src` or it fails to load (movies and series share the movie art).
 * Decorative (`alt=""`): the title next to it is the name. Always exactly `width` x `height` (the image is cropped to the box, the placeholder too), so rows never shift; the caller may add
 * `className` (e.g. margins) but the ring and rounding belong here.
 */
export function Cover({
  src,
  kind,
  width,
  height,
  className = '',
}: {
  src?: string
  kind: MediaKind
  width: number
  height: number
  className?: string
}) {
  const [failed, setFailed] = useState<string>()
  const ring = `ring-separator shrink-0 rounded-sm object-cover ring-1 ring-inset ${className}`
  if (src && failed !== src)
    return (
      <img
        src={src}
        alt=""
        width={width}
        height={height}
        style={{ width, height }}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(src)}
        className={ring}
      />
    )
  const art = PLACEHOLDERS[kind]
  return (
    <picture>
      <source media="(prefers-color-scheme: dark)" srcSet={art.dark} />
      <img
        src={art.light}
        alt=""
        width={width}
        height={height}
        style={{ width, height }}
        decoding="async"
        className={ring}
      />
    </picture>
  )
}
