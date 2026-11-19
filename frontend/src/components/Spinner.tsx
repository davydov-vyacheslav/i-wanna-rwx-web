/** Small inline CSS spinner; static under reduced motion. Decorative: the busy state is announced by the control. */
export function Spinner() {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none`}
    />
  )
}
