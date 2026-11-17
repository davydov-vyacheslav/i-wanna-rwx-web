import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { openDb } from './db'
import { DbProvider, useDb } from './DbProvider'

describe('db', () => {
  it('writes and reads a meta row', async () => {
    const db = openDb('u-rw')
    await db.meta.put({ key: 'k', value: { a: 1 } })
    expect((await db.meta.get('k'))?.value).toEqual({ a: 1 })
    db.close()
  })

  it('gives two user ids two isolated databases', async () => {
    const a = openDb('user-a')
    const b = openDb('user-b')
    expect(a.name).toBe('rwx-user-a')
    expect(b.name).toBe('rwx-user-b')
    await a.meta.put({ key: 'k', value: 'A' })
    expect(await b.meta.get('k')).toBeUndefined()
    await b.meta.put({ key: 'k', value: 'B' })
    expect((await a.meta.get('k'))?.value).toBe('A')
    a.close()
    b.close()
  })

  it('DbProvider exposes the user db and closes it on unmount', async () => {
    let handle: ReturnType<typeof useDb> | undefined
    function Probe() {
      handle = useDb()
      return <p>ready</p>
    }
    const { unmount } = render(
      <DbProvider userId="u-prov">
        <Probe />
      </DbProvider>,
    )
    await screen.findByText('ready')
    expect(handle?.name).toBe('rwx-u-prov')
    await waitFor(() => expect(handle?.isOpen()).toBe(true))
    unmount()
    await waitFor(() => expect(handle?.isOpen()).toBe(false))
  })
})
