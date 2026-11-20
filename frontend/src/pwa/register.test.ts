import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = () => void
const handlers = new Map<string, Handler>()
const register = vi.fn()
const update = vi.fn()
const messageSkipWaiting = vi.fn()
const addEventListener = vi.fn((name: string, h: Handler) => handlers.set(name, h))
const removeEventListener = vi.fn((name: string) => handlers.delete(name))
const Workbox = vi.fn(function () {
  return { register, update, messageSkipWaiting, addEventListener, removeEventListener }
})
vi.mock('workbox-window', () => ({ Workbox }))

const MINUTE = 60 * 1000

// Each load() adds document/window listeners; remove them so earlier tests' registrations do not answer later events.
const added: [EventTarget, string, EventListener][] = []

beforeEach(() => {
  for (const target of [document, window]) {
    const original = target.addEventListener.bind(target)
    vi.spyOn(target, 'addEventListener').mockImplementation(
      (type: string, l: EventListenerOrEventListenerObject, o?: unknown) => {
        added.push([target, type, l as EventListener])
        original(type, l, o as AddEventListenerOptions)
      },
    )
  }
  vi.resetModules()
  handlers.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const [target, type, l] of added.splice(0)) target.removeEventListener(type, l)
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function load(prod = true) {
  vi.stubEnv('PROD', prod)
  vi.stubGlobal('navigator', { serviceWorker: {} })
  const mod = await import('./register')
  return { mod, wb: mod.registerServiceWorker() }
}

function resume() {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('registerServiceWorker', () => {
  it('registers /sw.js in production builds', async () => {
    const { wb } = await load()
    expect(Workbox).toHaveBeenCalledWith('/sw.js')
    expect(register).toHaveBeenCalledOnce()
    expect(wb).toBeDefined()
  })

  it('does nothing outside production', async () => {
    const { wb } = await load(false)
    expect(wb).toBeUndefined()
    expect(Workbox).not.toHaveBeenCalled()
  })

  it('reports an update only after a waiting worker appears', async () => {
    const { mod } = await load()
    const listener = vi.fn()
    mod.subscribeUpdateReady(listener)
    expect(mod.getUpdateReady()).toBe(false)
    handlers.get('waiting')!()
    expect(mod.getUpdateReady()).toBe(true)
    expect(listener).toHaveBeenCalledOnce()
  })

  it('reload posts SKIP_WAITING and reloads once on controlling', async () => {
    const { mod } = await load()
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    mod.reloadForUpdate()
    expect(messageSkipWaiting).toHaveBeenCalledOnce()
    expect(reload).not.toHaveBeenCalled()
    const onControlling = handlers.get('controlling')!
    onControlling()
    expect(reload).toHaveBeenCalledOnce()
    expect(handlers.has('controlling')).toBe(false)
  })

  it('throttles update() on resume to once per 30 minutes', async () => {
    await load()
    resume()
    expect(update).not.toHaveBeenCalled() // the browser just checked at load
    vi.advanceTimersByTime(31 * MINUTE)
    resume()
    vi.advanceTimersByTime(10 * MINUTE)
    resume()
    expect(update).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(21 * MINUTE)
    resume()
    expect(update).toHaveBeenCalledTimes(2)
  })

  it('checks when the network comes back, sharing the throttle', async () => {
    await load()
    vi.advanceTimersByTime(31 * MINUTE)
    window.dispatchEvent(new Event('online'))
    resume()
    expect(update).toHaveBeenCalledOnce()
  })

  it('ignores visibilitychange to hidden', async () => {
    await load()
    vi.advanceTimersByTime(31 * MINUTE)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(update).not.toHaveBeenCalled()
  })
})
