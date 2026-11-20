import { describe, expect, it } from 'vitest'
import { isCover, NAVIGATION_DENYLIST } from './routes'

const match = (url: string, destination: RequestDestination = 'image') =>
  isCover({ url: new URL(url), request: { destination } })
const denied = (path: string) => NAVIGATION_DENYLIST.some((re) => re.test(path))

describe('isCover', () => {
  it('matches image requests to both cover hosts', () => {
    expect(match('https://covers.openlibrary.org/b/id/1-M.jpg')).toBe(true)
    expect(match('https://image.tmdb.org/t/p/w342/x.jpg')).toBe(true)
  })

  it('ignores avatars, same-origin API urls and non-image requests', () => {
    expect(match('https://avatars.githubusercontent.com/u/1')).toBe(false)
    expect(match('https://rwx.example/api/v1/cover.jpg')).toBe(false)
    expect(match('https://image.tmdb.org/t/p/w342/x.jpg', 'script')).toBe(false)
  })
})

describe('navigation denylist', () => {
  it('sends sign-in, API and actuator navigations to the network', () => {
    for (const path of ['/oauth2/authorization/github', '/api/v1/me', '/actuator/health']) {
      expect(denied(path)).toBe(true)
    }
  })

  it('serves SPA routes the shell', () => {
    for (const path of ['/media', '/login', '/reminders/licenses']) {
      expect(denied(path)).toBe(false)
    }
  })
})
