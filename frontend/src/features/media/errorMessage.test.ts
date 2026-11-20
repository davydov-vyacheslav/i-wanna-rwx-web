import { describe, expect, it } from 'vitest'
import { errorMessage } from './errorMessage'
import { errorFromResponse } from '../../api/errors'

const problem = (code: string, source?: string) => ({ title: 'x', status: 409, code, ...(source ? { source } : {}) })

describe('errorFromResponse: 409 and 422 told apart by code', () => {
  it('source_key_missing carries the source', () => {
    const e = errorFromResponse(409, problem('source_key_missing', 'tmdb'))
    expect(e).toMatchObject({ kind: 'source_key_missing', source: 'tmdb', status: 409 })
  })
  it('duplicate keeps existingId', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    expect(errorFromResponse(409, { ...problem('duplicate'), existingId: id })).toMatchObject({
      kind: 'duplicate',
      existingId: id,
    })
  })
  it('source_key_invalid is its own kind', () => {
    expect(errorFromResponse(409, problem('source_key_invalid', 'tmdb'))).toMatchObject({
      kind: 'source_key_invalid',
      source: 'tmdb',
    })
  })
  it('an unknown 409 code or a body-less 409 is not a duplicate', () => {
    expect(errorFromResponse(409, problem('whatever')).kind).toBe('server')
    expect(errorFromResponse(409, undefined).kind).toBe('server')
  })
  it('422 source_key_rejected is its own kind; other 422 unchanged', () => {
    expect(errorFromResponse(422, problem('source_key_rejected', 'tmdb')).kind).toBe('source_key_rejected')
    expect(errorFromResponse(422, problem('source_not_found', 'tmdb')).kind).toBe('source_not_found')
  })
  it('provider errors keep the source', () => {
    expect(errorFromResponse(504, problem('provider_timeout', 'open_library')).source).toBe('open_library')
  })
})

describe('errorMessage templates the source label', () => {
  const e = errorFromResponse(409, problem('source_key_missing', 'tmdb'))
  it.each([
    ['en', 'TMDb'],
    ['ru', 'TMDb'],
    ['uk', 'TMDb'],
  ] as const)('%s names the label', (locale, label) => {
    expect(errorMessage(locale, e, { tmdb: label })).toContain(label)
    expect(errorMessage(locale, e, { tmdb: label })).not.toContain('{source}')
  })
  it.each(['en', 'ru', 'uk'] as const)('%s source_key_invalid names the label too', (locale) => {
    const invalid = errorFromResponse(409, problem('source_key_invalid', 'tmdb'))
    expect(errorMessage(locale, invalid, { tmdb: 'TMDb' })).toContain('TMDb')
  })
  it('falls back to the raw id when the label is unknown', () => {
    expect(errorMessage('en', e)).toContain('tmdb')
    expect(errorMessage('en', errorFromResponse(409, problem('source_key_invalid', 'other')), {})).toContain('other')
  })
})
