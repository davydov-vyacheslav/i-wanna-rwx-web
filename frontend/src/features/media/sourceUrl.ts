const DRAFT_PREFIX = 'https://www.google.com/search?q='
export const MAX_DRAFT_CODE_POINTS = 200

/** ISO control characters (Cc), lone surrogates (Cs) and U+FFFD: the same set the server rejects. */
const FORBIDDEN = /[\p{Cc}\p{Cs}\uFFFD]/u

/** NFC + trim of a draft text, or undefined when the server would reject it (forbidden code point, blank, over 200). */
function draftText(text: string): string | undefined {
  if (FORBIDDEN.test(text)) return undefined
  const clean = text.normalize('NFC').trim()
  const length = [...clean].length
  return length >= 1 && length <= MAX_DRAFT_CODE_POINTS ? clean : undefined
}

const encoder = new TextEncoder()

/**
 * The draft entry's `sourceUrl`: a Google search link of the typed text, byte for byte what the server
 * builds (`DraftLink.build`): UTF-8 bytes outside `A-Za-z0-9-._~` as uppercase `%XX` (space is `%20`; deliberately
 * not `encodeURIComponent`, which leaves `!'()*`). Undefined when the text is not acceptable.
 */
export function draftLink(text: string): string | undefined {
  const clean = draftText(text)
  if (clean === undefined) return undefined
  let out = DRAFT_PREFIX
  for (const byte of encoder.encode(clean)) {
    const c = String.fromCharCode(byte)
    out += /[A-Za-z0-9\-._~]/.test(c) ? c : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
  }
  return out
}

/** The URL when it parses as https without credentials, else undefined. Links from data are rendered only through this. */
export function safeHttpsUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && !u.username && !u.password ? url : undefined
  } catch {
    return undefined
  }
}

/** Cover/source tap target: the stored `externalLink` when it is https; otherwise nothing. */
export function coverTapUrl(item: { externalLink?: string }): string | undefined {
  return safeHttpsUrl(item.externalLink)
}
