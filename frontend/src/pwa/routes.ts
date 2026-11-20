// Shared by sw.ts and its tests; plain data and one matcher, no worker globals.
export const COVER_HOSTS = ['covers.openlibrary.org', 'image.tmdb.org']

// Matched against pathname + search. Sign-in is a full-page navigation that the server redirects to GitHub,
// so the cached shell must never answer these.
export const NAVIGATION_DENYLIST = [/^\/api\//, /^\/actuator/, /^\/oauth2\//]

export const isCover = ({ url, request }: { url: URL; request: Pick<Request, 'destination'> }) =>
  request.destination === 'image' && COVER_HOSTS.includes(url.hostname)
