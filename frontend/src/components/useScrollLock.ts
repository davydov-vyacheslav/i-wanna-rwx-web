import { useEffect } from 'react'

/** The screen behind an open sheet or dialog does not scroll (the scroller is `main`; see index.css). Nested overlays count. */
export function useScrollLock() {
  useEffect(() => {
    const root = document.documentElement
    root.dataset.scrollLocked = String(Number(root.dataset.scrollLocked ?? 0) + 1)
    return () => {
      const left = Number(root.dataset.scrollLocked) - 1
      if (left > 0) root.dataset.scrollLocked = String(left)
      else delete root.dataset.scrollLocked
    }
  }, [])
}
