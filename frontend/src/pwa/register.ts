import { Workbox } from 'workbox-window'

// Checks after a resume or reconnect are throttled; browsers' own navigation checks need no help.
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

let wb: Workbox | undefined
let updateReady = false
const listeners = new Set<() => void>()

export function subscribeUpdateReady(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getUpdateReady = () => updateReady

/** Posts SKIP_WAITING and reloads once when the new worker takes control (`controlling` fires once per install). */
export function reloadForUpdate() {
  if (!wb) return
  const reload = () => {
    wb?.removeEventListener('controlling', reload)
    window.location.reload()
  }
  wb.addEventListener('controlling', reload)
  wb.messageSkipWaiting()
}

// Production builds only: there is no worker in `vite dev`. An iOS standalone app is resumed, not navigated, so the
// browser's own update check can be days late; resume and reconnect ask for it.
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return undefined
  const instance = new Workbox('/sw.js')
  wb = instance
  instance.addEventListener('waiting', () => {
    updateReady = true
    listeners.forEach((l) => l())
  })
  void instance.register()

  let lastCheck = Date.now()
  const check = () => {
    if (Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return
    lastCheck = Date.now()
    void instance.update()
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
  window.addEventListener('online', check)
  return instance
}
