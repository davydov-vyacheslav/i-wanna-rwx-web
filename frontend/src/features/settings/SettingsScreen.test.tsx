import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { authSignal } from '../../api/client'
import { t } from '../../i18n'
import { ME, json, mountSettings, settings } from '../../test/fixtures'
import type { UserSettings } from './useSettings'
import { zoneOptions } from './TimezoneSection'

const mount = (
  stored: Partial<UserSettings> = {},
  handler?: (req: Request) => Response | Promise<Response>,
  opts: { deviceZone?: string; me?: typeof ME } = {},
) => mountSettings(handler, { stored, ...opts })

const patches = (calls: Request[]) => calls.filter((c) => c.method === 'PATCH')

beforeEach(() => {
  authSignal.reset()
  localStorage.clear()
  window.history.replaceState(null, '', '/#/settings')
})

describe('Settings screen', () => {
  it('shows the name, sections in order, Sources in its slot', async () => {
    mount({})
    expect(await screen.findByText('octo cat')).toBeTruthy()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['Account', 'Sources', 'Language and timezone', 'Account data'])
  })

  it('shows initials when avatarUrl is null', () => {
    mount({})
    expect(screen.getByTestId('avatar-initials').textContent).toBe('OC')
    expect(document.querySelector('img')).toBeNull()
  })

  it('shows the image, and initials after it fails to load', () => {
    mount({}, undefined, { me: { ...ME, avatarUrl: 'http://localhost/a.png' } })
    const img = document.querySelector('img')!
    expect(img.getAttribute('src')).toBe('http://localhost/a.png')
    fireEvent.error(img)
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByTestId('avatar-initials').textContent).toBe('OC')
  })

  it('Sign out posts with CSRF', async () => {
    const { calls } = mount({})
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(authSignal.isSignedOut()).toBe(true))
    expect(await screen.findByRole('link', { name: 'Sign in with GitHub' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()
    const out = calls.find((c) => c.url.endsWith('/auth/logout'))!
    expect(out.method).toBe('POST')
    expect(out.headers.get('X-XSRF-TOKEN')).toBe('tok')
  })
})

describe('Language', () => {
  const select = (name = 'Language') => screen.getByRole('combobox', { name }) as HTMLSelectElement

  it('lists three languages in their own language, effective one selected', () => {
    mount({ locale: 'ru' })
    expect(
      within(select(t('ru', 'settings.language')))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['English', 'Русский', 'Українська'])
    expect(select(t('ru', 'settings.language')).value).toBe('ru')
  })

  it('choosing uk sends {locale:uk} and the screen re-renders in Ukrainian', async () => {
    const { calls } = mount({}, (req) => json(settings({ locale: req.method === 'PATCH' ? 'uk' : 'en' })))
    fireEvent.change(select(), { target: { value: 'uk' } })
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(t('uk', 'settings.title')))
    expect(await patches(calls)[0]!.json()).toEqual({ locale: 'uk' })
    expect((screen.getByRole('combobox', { name: t('uk', 'settings.language') }) as HTMLSelectElement).value).toBe('uk')
  })

  it('failure keeps the previous language and shows an inline error', async () => {
    mount({}, () => json({ code: 'boom' }, 500))
    fireEvent.change(select(), { target: { value: 'ru' } })
    expect((await screen.findByRole('alert')).textContent).toBe(t('en', 'settings.saveFailed'))
    expect(select().value).toBe('en')
  })

  it('is disabled while the request is pending', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    mount({}, async () => {
      await gate
      return json(settings({ locale: 'ru' }))
    })
    fireEvent.change(select(), { target: { value: 'ru' } })
    await waitFor(() => expect(select().disabled).toBe(true))
    release()
  })
})

describe('Timezone', () => {
  const select = () => screen.getByRole('combobox', { name: 'Timezone' }) as HTMLSelectElement

  it('shows the stored value; no device button when the zones match', () => {
    mount({}, undefined, { deviceZone: 'Europe/London' })
    expect(select().value).toBe('Europe/London')
    expect(screen.queryByRole('button', { name: /device/ })).toBeNull()
  })

  it('adds the stored and device zones when the ICU list lacks them (Europe/Kyiv)', () => {
    const lacking = zoneOptions('Europe/Kyiv', 'Pacific/Nowhere')
    expect(lacking).toContain('Europe/Kyiv')
    expect(lacking).toContain('Pacific/Nowhere')
    expect(lacking[0]).toBe('UTC')
    mount({ timeZone: 'Europe/Kyiv' }, undefined, {
      deviceZone: 'Pacific/Nowhere',
    })
    expect(select().value).toBe('Europe/Kyiv')
    expect(within(select()).getByRole('option', { name: 'Pacific/Nowhere' })).toBeTruthy()
  })

  it('choosing a zone sends it; picking UTC sets the chosen flag', async () => {
    const { calls } = mount(
      {},
      (req) => {
        void req
        return json(settings({ timeZone: 'UTC' }))
      },
      { deviceZone: 'Europe/London' },
    )
    fireEvent.change(select(), { target: { value: 'UTC' } })
    await waitFor(() => expect(localStorage.getItem('rwx.tz.chosen.u1')).toBe('1'))
    expect(await patches(calls)[0]!.json()).toEqual({ timeZone: 'UTC' })
  })

  it('a non-UTC choice does not set the chosen flag', async () => {
    const { calls } = mount({}, () => json(settings({ timeZone: 'Asia/Tokyo' })), {
      deviceZone: 'Europe/London',
    })
    fireEvent.change(select(), { target: { value: 'Asia/Tokyo' } })
    await waitFor(() => expect(select().value).toBe('Asia/Tokyo'))
    expect(patches(calls)).toHaveLength(1)
    expect(localStorage.getItem('rwx.tz.chosen.u1')).toBeNull()
  })

  it('400 invalid_timezone shows the error and keeps the old value', async () => {
    mount({}, () => json({ code: 'invalid_timezone' }, 400), {
      deviceZone: 'Europe/London',
    })
    fireEvent.change(select(), { target: { value: 'Asia/Tokyo' } })
    expect((await screen.findByRole('alert')).textContent).toBe(t('en', 'settings.timezoneInvalid'))
    expect(select().value).toBe('Europe/London')
  })

  it('other failure shows the generic save error', async () => {
    mount({}, () => json({ code: 'boom' }, 500), {
      deviceZone: 'Europe/London',
    })
    fireEvent.change(select(), { target: { value: 'Asia/Tokyo' } })
    expect((await screen.findByRole('alert')).textContent).toBe(t('en', 'settings.saveFailed'))
    expect(select().value).toBe('Europe/London')
  })

  it('the device label shows spaces instead of underscores', () => {
    mount({}, undefined, { deviceZone: 'America/Sao_Paulo' })
    expect(screen.getByRole('button', { name: "Use this device's timezone (America/Sao Paulo)" })).toBeTruthy()
  })

  it('stored UTC + device differs: Keep UTC sets the flag, sends nothing and hides itself', () => {
    const { calls } = mount({ timeZone: 'UTC' }, undefined, { deviceZone: 'Europe/Kyiv' })
    expect(screen.getByRole('button', { name: /device's timezone/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep UTC on this device' }))
    expect(localStorage.getItem('rwx.tz.chosen.u1')).toBe('1')
    expect(screen.queryByRole('button', { name: 'Keep UTC on this device' })).toBeNull()
    expect(patches(calls)).toHaveLength(0)
  })

  it.each([
    ['stored London', {}, 'Asia/Tokyo'],
    ['device UTC', { timeZone: 'UTC' }, 'UTC'],
  ])('Keep UTC is not offered (%s)', (_n, stored, device) => {
    mount(stored, undefined, { deviceZone: device })
    expect(screen.queryByRole('button', { name: 'Keep UTC on this device' })).toBeNull()
  })

  it('Keep UTC is not offered once the flag is set', () => {
    localStorage.setItem('rwx.tz.chosen.u1', '1')
    mount({ timeZone: 'UTC' }, undefined, { deviceZone: 'Europe/Kyiv' })
    expect(screen.queryByRole('button', { name: 'Keep UTC on this device' })).toBeNull()
  })

  it('device button sends the device zone and then disappears', async () => {
    const { calls } = mount({}, () => json(settings({ timeZone: 'Asia/Tokyo' })), {
      deviceZone: 'Asia/Tokyo',
    })
    const label = t('en', 'settings.timezoneUseDevice').replace('{zone}', 'Asia/Tokyo')
    fireEvent.click(screen.getByRole('button', { name: label }))
    await waitFor(() => expect(screen.queryByRole('button', { name: label })).toBeNull())
    expect(await patches(calls)[0]!.json()).toEqual({ timeZone: 'Asia/Tokyo' })
  })
})
