import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authSignal } from '../../api/client'
import { t } from '../../i18n'
import { ME_KEY } from '../identity/useMe'
import { ME, json, mountSettings as mount } from '../../test/fixtures'
import { fileNameFromDisposition } from './useAccountData'

let clicked: { download: string; href: string }[]
let revoked: string[]

beforeEach(() => {
  authSignal.reset()
  localStorage.clear()
  clicked = []
  revoked = []
  URL.createObjectURL = vi.fn(() => 'blob:rwx-1')
  URL.revokeObjectURL = vi.fn((u: string) => void revoked.push(u))
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ download: this.download, href: this.href })
  })
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('Export', () => {
  it('downloads with the Content-Disposition name, one GET, URL revoked after 5 s', async () => {
    // capture only the 5 s revoke timer; everything else keeps running on real timers
    const realSetTimeout = globalThis.setTimeout
    const delayed: (() => void)[] = []
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number, ...a: unknown[]) => {
      if (ms === 5000) {
        delayed.push(fn)
        return 0
      }
      return realSetTimeout(fn, ms, ...a)
    }) as unknown as typeof setTimeout)
    const { calls } = mount(() =>
      json({ x: 1 }, 200, { 'Content-Disposition': 'attachment; filename="rwx-export-2026-01-02.json"' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Export my data' }))
    await waitFor(() => expect(clicked).toHaveLength(1))
    expect(clicked[0]!.download).toBe('rwx-export-2026-01-02.json')
    expect(clicked[0]!.href).toBe('blob:rwx-1')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.method).toBe('GET')
    expect(new URL(calls[0]!.url).pathname).toBe('/api/v1/me/export')
    expect(delayed).toHaveLength(1)
    expect(revoked).toEqual([])
    delayed[0]!()
    expect(revoked).toEqual(['blob:rwx-1'])
    expect(document.querySelector('a[download]')).toBeNull()
  })

  it('uses a dated fallback name without the header', async () => {
    mount(() => json({ x: 1 }))
    fireEvent.click(screen.getByRole('button', { name: 'Export my data' }))
    await waitFor(() => expect(clicked).toHaveLength(1))
    expect(clicked[0]!.download).toMatch(/^rwx-export-\d{4}-\d{2}-\d{2}\.json$/)
  })

  it('shows pending state', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    mount(async () => {
      await gate
      return json({})
    })
    fireEvent.click(screen.getByRole('button', { name: 'Export my data' }))
    const busy = (await screen.findByRole('button', { name: 'Exporting...' })) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    expect(busy.querySelector('.animate-spin')).toBeTruthy()
    release()
    await waitFor(() => expect(clicked).toHaveLength(1))
  })

  it('401 is handled as signed out', async () => {
    mount(() => json({ code: 'unauthorized' }, 401))
    fireEvent.click(screen.getByRole('button', { name: 'Export my data' }))
    await waitFor(() => expect(authSignal.isSignedOut()).toBe(true))
    expect(clicked).toHaveLength(0)
  })

  it('failure shows the inline error and no download', async () => {
    mount(() => json({ code: 'boom' }, 500))
    fireEvent.click(screen.getByRole('button', { name: 'Export my data' }))
    expect((await screen.findByRole('alert')).textContent).toBe(t('en', 'settings.exportFailed'))
    expect(clicked).toHaveLength(0)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})

describe('fileNameFromDisposition', () => {
  it.each([
    ['attachment; filename="a.json"', 'a.json'],
    ['attachment; filename=a.json', 'a.json'],
    ["attachment; filename*=UTF-8''r%C3%BC.json", 'rü.json'],
    ['attachment; filename="../../x.json"', '.._.._x.json'],
    ['attachment', null],
    [null, null],
  ])('%s', (h, expected) => expect(fileNameFromDisposition(h)).toBe(expected))
})

describe('Delete account', () => {
  const open = () => fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
  const dialog = () => screen.getByRole('alertdialog')

  it('opens a labelled alertdialog with Cancel focused', () => {
    mount(() => json(ME))
    open()
    const d = dialog()
    expect(d.getAttribute('aria-labelledby')).toBeTruthy()
    expect(screen.getByRole('alertdialog', { name: 'Delete your account?' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
  })

  it('cancel, Escape and scrim send nothing and return focus to the row', async () => {
    const { calls } = mount(() => json(ME))
    const row = screen.getByRole('button', { name: 'Delete account' })
    row.focus()
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(row))
    open()
    fireEvent.keyDown(dialog(), { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    open()
    fireEvent.click(dialog().parentElement!.firstElementChild!)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('confirm sends DELETE with CSRF, clears rwx.* keys and signs out', async () => {
    localStorage.setItem('rwx.tz.chosen.u1', '1')
    localStorage.setItem('rwx.list.books', 'x')
    localStorage.setItem('other', 'keep')
    const { calls, qc } = mount(() => new Response(null, { status: 204 }))
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    await waitFor(() => expect(authSignal.isSignedOut()).toBe(true))
    expect(await screen.findByRole('link', { name: 'Sign in with GitHub' })).toBeTruthy()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(calls).toHaveLength(1)
    expect(calls[0]!.method).toBe('DELETE')
    expect(new URL(calls[0]!.url).pathname).toBe('/api/v1/me')
    expect(calls[0]!.headers.get('X-XSRF-TOKEN')).toBe('tok')
    expect(localStorage.getItem('rwx.tz.chosen.u1')).toBeNull()
    expect(localStorage.getItem('rwx.list.books')).toBeNull()
    expect(localStorage.getItem('other')).toBe('keep')
    expect(qc.getQueryData(ME_KEY)).toBeUndefined()
  })

  it('500 keeps the dialog open with an inline error, retry is possible, nothing cleared', async () => {
    localStorage.setItem('rwx.a', '1')
    let n = 0
    const { calls } = mount(() => (++n === 1 ? json({ code: 'boom' }, 500) : new Response(null, { status: 204 })))
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    expect((await screen.findByRole('alert')).textContent).toBe(t('en', 'settings.deleteFailed'))
    expect(dialog()).toBeTruthy()
    expect(authSignal.isSignedOut()).toBe(false)
    expect(localStorage.getItem('rwx.a')).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    await waitFor(() => expect(authSignal.isSignedOut()).toBe(true))
    expect(calls).toHaveLength(2)
  })

  it('double click sends one request and confirm is disabled while pending', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const { calls } = mount(async () => {
      await gate
      return new Response(null, { status: 204 })
    })
    open()
    const confirm = screen.getByRole('button', { name: 'Delete permanently' }) as HTMLButtonElement
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() => expect(confirm.disabled).toBe(true))
    fireEvent.click(confirm)
    release()
    await waitFor(() => expect(authSignal.isSignedOut()).toBe(true))
    expect(await screen.findByRole('link', { name: 'Sign in with GitHub' })).toBeTruthy()
    expect(calls).toHaveLength(1)
  })

  it('while the DELETE is in flight Cancel, Escape and the scrim are ignored; after a failure they work again', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const { calls } = mount(async () => {
      await gate
      return json({ code: 'boom' }, 500)
    })
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    const cancel = screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement
    await waitFor(() => expect(cancel.disabled).toBe(true))
    expect((screen.getByRole('button', { name: 'Delete permanently' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(cancel)
    fireEvent.keyDown(dialog(), { key: 'Escape' })
    fireEvent.click(dialog().parentElement!.firstElementChild!)
    expect(dialog()).toBeTruthy()
    await waitFor(() => expect(dialog().contains(document.activeElement)).toBe(true))
    expect(document.activeElement).not.toBe(document.body)
    expect(screen.getByRole('button', { name: /Delete permanently/ }).querySelector('.animate-spin')).toBeTruthy()
    release()
    await screen.findByRole('alert')
    expect(cancel.disabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Delete permanently' }).querySelector('.animate-spin')).toBeNull()
    fireEvent.keyDown(dialog(), { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(calls).toHaveLength(1)
  })

  it('after a failed delete focus returns to Cancel and Escape closes the dialog', async () => {
    mount(() => json({ code: 'boom' }, 500))
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    await screen.findByRole('alert')
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    await waitFor(() => expect(document.activeElement).toBe(cancel))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
