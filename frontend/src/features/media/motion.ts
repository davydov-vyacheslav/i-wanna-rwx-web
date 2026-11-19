/** Duration of the list-removal fade (design system: 220ms, fade + height collapse). */
export const LEAVE_MS = 220

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
