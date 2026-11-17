import { describe, expect, it } from 'vitest'
import { db } from './db'

describe('db', () => {
  it('writes and reads a meta row', async () => {
    await db.meta.put({ key: 'k', value: { a: 1 } })
    expect((await db.meta.get('k'))?.value).toEqual({ a: 1 })
  })
})
