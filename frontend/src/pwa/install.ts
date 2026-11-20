import { useSyncExternalStore } from 'react'

export type InstallMode = 'installed' | 'prompt' | 'ios-steps' | 'none'

/** Chromium's install event; not in lib.dom. */
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<unknown> }

export function detectInstallMode(env: {
  matchMedia: (query: string) => { matches: boolean }
  navigator: { userAgent: string; platform: string; maxTouchPoints: number; standalone?: boolean }
  hasPromptEvent: boolean
}): InstallMode {
  const { navigator: nav } = env
  if (env.matchMedia('(display-mode: standalone)').matches || nav.standalone === true) return 'installed'
  if (env.hasPromptEvent) return 'prompt'
  // iPadOS 13+ in desktop mode reports itself as a Mac, the touch points tell it apart
  const ios = /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  return ios ? 'ios-steps' : 'none'
}

let promptEvent: BeforeInstallPromptEvent | undefined
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/** `beforeinstallprompt` can fire before any component mounts, so main.tsx starts this at boot. */
let capturing = false
export function captureInstallEvents() {
  if (capturing) return
  capturing = true
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // keep the browser's mini-infobar away; the Settings row is the only entry
    promptEvent = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    promptEvent = undefined
    notify()
  })
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getMode = () =>
  detectInstallMode({
    matchMedia: (q) => window.matchMedia(q),
    navigator,
    hasPromptEvent: promptEvent !== undefined,
  })

/** The event can be used once: it is dropped before the browser prompt opens, so the row is hidden even after a dismissal. */
function promptInstall() {
  const event = promptEvent
  promptEvent = undefined
  notify()
  return event?.prompt()
}

export function useInstall() {
  const mode = useSyncExternalStore(subscribe, getMode)
  return { mode, promptInstall }
}
