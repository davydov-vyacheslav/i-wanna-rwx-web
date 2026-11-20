import { useSyncExternalStore } from 'react'

const WIDE = '(min-width: 768px)'
const subscribeWide = (notify: () => void) => {
  const query = window.matchMedia(WIDE)
  query.addEventListener('change', notify)
  return () => query.removeEventListener('change', notify)
}

/** From `md` up a list is a table: one list in the DOM at a time, so nothing is duplicated (the test setup stubs matchMedia as narrow). */
export function useWide(): boolean {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches)
}
