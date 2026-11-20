import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApiClient } from '../../api/client'
import { json, ME, settings } from '../../test/fixtures'
import { AppShell } from '../shell/AppShell'
import type { Subscription } from './types'

const ID = '00000000-0000-0000-0000-000000000001'
const sub = (over: Partial<Subscription> = {}): Subscription => ({
  id: ID,
  userId: ME.id,
  name: 'Netflix',
  expiryDate: '2030-03-15',
  renewalPattern: 'monthly',
  remindDays: 3,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
})

interface Call {
  method: string
  path: string
  body: Record<string, unknown> | null
}

/** `reply` answers writes (a Response, or undefined for the default); the list is whatever `store` holds. */
function mount(
  items: Subscription[],
  reply: (call: Call) => Response | Promise<Response> | undefined = () => undefined,
) {
  const store = [...items]
  const calls: Call[] = []
  const api = createApiClient({
    baseUrl: 'http://localhost',
    csrfToken: () => 'tok',
    fetch: async (input, init) => {
      const req = input instanceof Request ? input : new Request(input, init)
      const path = new URL(req.url).pathname
      if (path.endsWith('/settings')) return json(settings({ timeZone: 'UTC' }))
      const text = await req.text()
      const call: Call = { method: req.method, path, body: text ? (JSON.parse(text) as Call['body']) : null }
      if (req.method === 'GET') return json(path.endsWith(K.path) ? store : [])
      calls.push(call)
      const custom = await reply(call)
      if (custom) return custom
      if (req.method === 'DELETE') {
        store.splice(0, store.length, ...store.filter((x) => !path.endsWith(x.id)))
        return new Response(null, { status: 204 })
      }
      const row =
        req.method === 'POST' && !path.endsWith('/renew') ? sub({ ...call.body }) : { ...store[0], ...call.body }
      return json(row, req.method === 'POST' ? 201 : 200)
    },
  })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AppShell me={ME} api={api} locale="en" />
    </QueryClientProvider>,
  )
  return { calls, store }
}

const problem = (status: number, errors: { field: string; message: string }[] = []) =>
  json({ status, code: status === 400 ? 'validation' : 'gone', title: 'x', errors }, status)

const dialog = () => screen.getByRole('dialog')
const field = (label: string) => within(dialog()).getByLabelText(label)
const save = () => within(dialog()).getByRole('button', { name: 'Save' }) as HTMLButtonElement
const type = (label: string, value: string) => fireEvent.change(field(label), { target: { value } })
const pick = (name: string) => fireEvent.click(within(dialog()).getByRole('radio', { name }))
const openAdd = async () => {
  fireEvent.click(await screen.findByRole('button', { name: K.add }))
  return dialog()
}
const openDetail = async (name = 'Netflix') => {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${name}`) }))
  return dialog()
}
const fillValid = () => {
  type('Name', 'Spotify')
  type('Expiry date', '2030-05-01')
}

const KINDS = [
  {
    path: 'subscriptions',
    add: 'Add subscription',
    new: 'New subscription',
    edit: 'Edit subscription',
    empty: 'No subscriptions yet',
  },
  { path: 'licenses', add: 'Add license', new: 'New license', edit: 'Edit license', empty: 'No licenses yet' },
] as const
let K: (typeof KINDS)[number] = KINDS[0]

describe.each(KINDS)('$path', (kind) => {
  beforeEach(() => {
    K = kind
    localStorage.clear()
    window.history.replaceState(null, '', `/#/reminders/${kind.path}`)
  })

  describe('opening the add sheet', () => {
    it('the empty-state button opens it, and the name is focused', async () => {
      mount([])
      await openAdd()
      expect(dialog().getAttribute('aria-labelledby')).toBeTruthy()
      expect(within(dialog()).getByRole('heading', { name: K.new })).toBeTruthy()
      expect(document.activeElement).toBe(field('Name'))
    })

    it('the FAB opens it when there are rows', async () => {
      mount([sub()])
      await openAdd()
      expect(within(dialog()).getByRole('heading', { name: K.new })).toBeTruthy()
    })
  })

  describe('validation', () => {
    it('Save stays enabled: with a missing name or date it sends nothing, marks the field and focuses the first bad one', async () => {
      const { calls } = mount([])
      await openAdd()
      expect(save().disabled).toBe(false)
      fireEvent.click(save())
      expect(calls).toHaveLength(0)
      expect(field('Name').getAttribute('aria-invalid')).toBe('true')
      expect(field('Expiry date').getAttribute('aria-invalid')).toBe('true')
      expect(document.activeElement).toBe(field('Name'))
      type('Name', 'Spotify')
      fireEvent.click(save())
      expect(calls).toHaveLength(0)
      expect(field('Name').getAttribute('aria-invalid')).toBeNull()
      expect(document.activeElement).toBe(field('Expiry date'))
      type('Expiry date', '2030-05-01')
      type('Name', '   ')
      fireEvent.click(save())
      expect(calls).toHaveLength(0)
      expect(field('Name').getAttribute('aria-invalid')).toBe('true')
    })

    it('custom days exist only for Custom and must be 1..36500', async () => {
      const { calls } = mount([])
      await openAdd()
      fillValid()
      expect(within(dialog()).queryByLabelText('Renew every (days)')).toBeNull()
      pick('Custom')
      for (const bad of ['', '0', '-5', '36501', '1.5']) {
        type('Renew every (days)', bad)
        fireEvent.click(save())
        expect(calls).toHaveLength(0)
        expect(field('Renew every (days)').getAttribute('aria-invalid')).toBe('true')
      }
      expect(within(dialog()).getByText('Enter a whole number from 1 to 36500.')).toBeTruthy()
      type('Renew every (days)', '36500')
      expect(field('Renew every (days)').getAttribute('aria-invalid')).toBeNull()
    })

    it('lifetime hides the expiry date and the remind stepper', async () => {
      mount([])
      await openAdd()
      type('Name', 'Forever')
      pick('Lifetime')
      expect(within(dialog()).queryByLabelText('Expiry date')).toBeNull()
      expect(within(dialog()).queryByRole('button', { name: 'More days' })).toBeNull()
      expect(field('Name').getAttribute('aria-invalid')).toBeNull()
    })

    it('the expiry year is at most 2999', async () => {
      mount([])
      await openAdd()
      fillValid()
      type('Expiry date', '3000-01-01')
      fireEvent.click(save())
      expect(field('Expiry date').getAttribute('aria-invalid')).toBe('true')
      expect(within(dialog()).getByText('Enter a date up to 2999-12-31.')).toBeTruthy()
      type('Expiry date', '2999-12-31')
      expect(field('Expiry date').getAttribute('aria-invalid')).toBeNull()
    })

    it('remind days stay within 1..14', async () => {
      mount([])
      await openAdd()
      const more = within(dialog()).getByRole('button', { name: 'More days' }) as HTMLButtonElement
      const fewer = within(dialog()).getByRole('button', { name: 'Fewer days' }) as HTMLButtonElement
      for (let i = 0; i < 20; i++) if (!more.disabled) fireEvent.click(more)
      expect(within(dialog()).getByText('14 days')).toBeTruthy()
      for (let i = 0; i < 20; i++) if (!fewer.disabled) fireEvent.click(fewer)
      expect(within(dialog()).getByText('1 day')).toBeTruthy()
    })
  })

  describe('create', () => {
    it('posts the composed body with a client id and closes', async () => {
      const { calls } = mount([])
      await openAdd()
      fillValid()
      pick('Custom')
      type('Renew every (days)', '45')
      type('Cost', '9.99 USD')
      fireEvent.click(save())
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(calls).toHaveLength(1)
      expect(calls[0]!.body).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        name: 'Spotify',
        renewalPattern: 'custom',
        customRenewalDays: 45,
        expiryDate: '2030-05-01',
        remindDays: 3,
        cost: '9.99 USD',
      })
    })

    it('a lifetime body has no expiry date', async () => {
      const { calls } = mount([])
      await openAdd()
      type('Name', 'Forever')
      pick('Lifetime')
      fireEvent.click(save())
      await waitFor(() => expect(calls).toHaveLength(1))
      expect(calls[0]!.body).not.toHaveProperty('expiryDate')
      expect(calls[0]!.body).toMatchObject({ renewalPattern: 'lifetime', remindDays: 3 })
    })

    it('a failed create keeps the sheet and values, and the retry sends the same id', async () => {
      let n = 0
      const { calls } = mount([], () => (++n === 1 ? new Response(null, { status: 500 }) : undefined))
      await openAdd()
      fillValid()
      fireEvent.click(save())
      const alert = await within(dialog()).findByRole('alert')
      expect(alert.textContent).toMatch(/something went wrong/i)
      // pinned with Save, not inside the scrolling form
      expect(alert.closest('form')).toBeNull()
      expect((field('Name') as HTMLInputElement).value).toBe('Spotify')
      fireEvent.click(save())
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(calls).toHaveLength(2)
      expect(calls[1]!.body!.id).toBe(calls[0]!.body!.id)
    })

    it('a 400 naming a field is shown on that field', async () => {
      mount([], () => problem(400, [{ field: 'expiryDate', message: 'must not be after 2999-12-31' }]))
      await openAdd()
      fillValid()
      fireEvent.click(save())
      expect(await within(dialog()).findByText('must not be after 2999-12-31')).toBeTruthy()
      expect(field('Expiry date').getAttribute('aria-invalid')).toBe('true')
    })

    it('a 400 without a known field is shown on the sheet', async () => {
      mount([], () => problem(400, [{ field: 'remindDays', message: 'must be 1..14' }]))
      await openAdd()
      fillValid()
      fireEvent.click(save())
      expect(await within(dialog()).findByRole('alert')).toBeTruthy()
    })
  })

  describe('edit', () => {
    it('patches only the changed fields', async () => {
      const { calls } = mount([sub({ cost: '$10' })])
      await openDetail()
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Edit' }))
      const sheet = screen.getByRole('heading', { name: K.edit }).closest('[role=dialog]') as HTMLElement
      expect(within(sheet).getByLabelText('Name')).not.toBe(document.activeElement)
      fireEvent.change(within(sheet).getByLabelText('Name'), { target: { value: 'Netflix 4K' } })
      fireEvent.change(within(sheet).getByLabelText('Cost'), { target: { value: '' } })
      fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(screen.queryByRole('heading', { name: K.edit })).toBeNull())
      expect(calls).toHaveLength(1)
      expect(calls[0]).toMatchObject({ method: 'PATCH', body: { name: 'Netflix 4K', cost: '' } })
      expect(Object.keys(calls[0]!.body!).sort()).toEqual(['cost', 'name'])
    })

    it('an unchanged form sends nothing', async () => {
      const { calls } = mount([sub()])
      await openDetail()
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Edit' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(screen.queryByRole('heading', { name: K.edit })).toBeNull())
      expect(calls).toHaveLength(0)
    })
  })

  describe('renew', () => {
    it('sends the shown date, waits for the server, then shows the new date and a toast', async () => {
      let release: (r: Response) => void = () => {}
      const { calls } = mount([sub()], () => new Promise<Response>((resolve) => (release = resolve)))
      await openDetail()
      const renewed = within(dialog()).getByRole('button', { name: 'Renewed' }) as HTMLButtonElement
      expect(within(dialog()).getByText('Mar 15, 2030')).toBeTruthy()
      fireEvent.click(renewed)
      await waitFor(() => expect(calls).toHaveLength(1))
      expect(calls[0]).toMatchObject({ method: 'POST', body: { expectedExpiryDate: '2030-03-15' } })
      expect(calls[0]!.path).toMatch(/\/renew$/)
      expect(renewed.getAttribute('aria-busy')).toBe('true')
      expect(within(dialog()).getByText('Mar 15, 2030')).toBeTruthy()
      fireEvent.click(renewed)
      expect(calls).toHaveLength(1)
      release(json(sub({ expiryDate: '2030-04-15', version: 2 })))
      expect(await within(dialog()).findByText('Apr 15, 2030')).toBeTruthy()
      expect(await screen.findByText('Renewed until Apr 15, 2030')).toBeTruthy()
    })

    it('is aria-disabled but focusable, with a note, for one-off and lifetime', async () => {
      const { calls } = mount([
        sub({ renewalPattern: 'none' }),
        sub({ id: ID.replace('1', '2'), name: 'Forever', renewalPattern: 'lifetime', expiryDate: null }),
      ])
      await openDetail('Netflix')
      const renewed = () => within(dialog()).getByRole('button', { name: 'Renewed' }) as HTMLButtonElement
      expect(renewed().getAttribute('aria-disabled')).toBe('true')
      expect(renewed().disabled).toBe(false)
      expect(within(dialog()).getByText("One-off and lifetime items can't be renewed.")).toBeTruthy()
      fireEvent.click(renewed())
      expect(calls.some((c) => c.path.endsWith('/renew'))).toBe(false)
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }))
      await openDetail('Forever')
      expect(renewed().getAttribute('aria-disabled')).toBe('true')
    })

    it('Escape closes the detail', async () => {
      mount([sub()])
      await openDetail()
      fireEvent.keyDown(dialog(), { key: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it.each([404, 410])('a %i removes the row and its sheet', async (status) => {
      const { store } = mount([sub()], (call) => {
        if (call.path.endsWith('/renew')) {
          store.length = 0
          return problem(status)
        }
      })
      await openDetail()
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Renewed' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(await screen.findByText('This item no longer exists.')).toBeTruthy()
      await waitFor(() => expect(screen.queryByText('Netflix')).toBeNull())
    })

    it('a failed renew changes nothing and says why', async () => {
      mount([sub()], () => problem(400))
      await openDetail()
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Renewed' }))
      expect(await screen.findByText("Can't renew: the date would be out of range.")).toBeTruthy()
      expect(within(dialog()).getByText('Mar 15, 2030')).toBeTruthy()
    })
  })

  describe('delete', () => {
    it('asks first; Cancel keeps the row', async () => {
      const { calls } = mount([sub()])
      await openDetail()
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }))
      const confirm = screen.getByRole('alertdialog')
      fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByRole('alertdialog')).toBeNull()
      expect(calls).toHaveLength(0)
      expect(within(dialog()).getByText('Netflix')).toBeTruthy()
    })

    it('Delete removes the row and closes the detail', async () => {
      const { calls } = mount([sub()])
      await openDetail()
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }))
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(calls).toMatchObject([{ method: 'DELETE' }])
      expect(await screen.findByText(K.empty)).toBeTruthy()
    })

    it('a 404 on delete removes the row', async () => {
      const { store } = mount([sub()], (call) => {
        if (call.method === 'DELETE') {
          store.length = 0
          return problem(404)
        }
      })
      await openDetail()
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }))
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
      expect(await screen.findByText(K.empty)).toBeTruthy()
      cleanup()
    })
  })
})

describe('license key', () => {
  const KEY = 'AAAA-BBBB\nCCCC-DDDD'
  const lic = (over: Partial<Subscription> = {}) => ({ ...sub(over), licenseKey: KEY })
  beforeEach(() => {
    K = KINDS[1]
    localStorage.clear()
    window.history.replaceState(null, '', '/#/reminders/licenses')
  })

  it('is masked in the detail until Reveal, and masked again after close', async () => {
    mount([lic()])
    await openDetail()
    expect(within(dialog()).queryByText(/AAAA/)).toBeNull()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Reveal' }))
    expect(within(dialog()).getByText(/AAAA-BBBB/)).toBeTruthy()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Hide' }))
    expect(within(dialog()).queryByText(/AAAA/)).toBeNull()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Reveal' }))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }))
    await openDetail()
    expect(within(dialog()).queryByText(/AAAA/)).toBeNull()
  })

  it('is masked again after Edit', async () => {
    mount([lic()])
    await openDetail()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Reveal' }))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText(/AAAA/, { selector: 'span' })).toBeNull()
  })

  it('create sends the key only when entered', async () => {
    const { calls } = mount([])
    await openAdd()
    fillValid()
    fireEvent.click(save())
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.body).not.toHaveProperty('licenseKey')

    cleanup()
    const second = mount([])
    await openAdd()
    fillValid()
    type('License key', KEY)
    fireEvent.click(save())
    await waitFor(() => expect(second.calls).toHaveLength(1))
    expect(second.calls[0]!.body).toMatchObject({ licenseKey: KEY })
  })

  it('edit holds the key in clear text; PATCH omits it unless changed, and clearing sends blank', async () => {
    const { calls } = mount([lic()])
    await openDetail()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Edit' }))
    expect((field('License key') as HTMLTextAreaElement).value).toBe(KEY)
    type('Name', 'Netflix 4K')
    fireEvent.click(save())
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.body).toEqual({ name: 'Netflix 4K' })

    await waitFor(() => expect(screen.queryByRole('heading', { name: K.edit })).toBeNull())
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Edit' }))
    type('License key', '')
    fireEvent.click(save())
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1]!.body).toEqual({ licenseKey: '' })
  })

  it('renew does not send the key', async () => {
    const { calls } = mount([lic()])
    await openDetail()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Renewed' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.body).toEqual({ expectedExpiryDate: '2030-03-15' })
  })
})
