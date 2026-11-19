import { describe, expect, it } from 'vitest'
import vectors from '../../../../api/test-vectors/source-urls.json'
import { titleKey } from './duplicates'
import { draftLink } from './sourceUrl'

// The shared vector file also drives the Java side (DraftLink, TitleKey); both must agree byte for byte.
describe('shared source-url vectors', () => {
  it.each(vectors.draftLinks.accept.map((c) => [c.name, c.title, c.link] as const))(
    'draftLink(%s)',
    (_name, title, link) => {
      expect(draftLink(title)).toBe(link)
    },
  )

  it.each(vectors.draftLinkBuild.map((c) => [c.text, c.link] as const))('draftLink build %j', (text, link) => {
    expect(draftLink(text)).toBe(link)
  })

  it.each(vectors.titleKey.map((c) => [c.input, c.key] as const))('titleKey(%j) = %j', (input, key) => {
    expect(titleKey(input)).toBe(key)
  })
})
