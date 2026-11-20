import { useId, useRef, type ReactNode } from 'react'

/** Grouped-list row with the label on the left and a native select on the right (value in secondary ink, chevron; the same on every width). */
export function SelectRow({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  children: ReactNode
}) {
  const labelId = useId()
  // Chrome keeps focus on a select after a mouse pick: drop it then (the keyboard keeps it). The select has no outline:
  // Chrome and Safari paint an orange one after a mouse pick or a dismissed list.
  const pointer = useRef(false)
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 px-4">
      <span id={labelId} className="text-input shrink-0">
        {label}
      </span>
      <span className="relative flex min-w-0">
        <select
          aria-labelledby={labelId}
          value={value}
          disabled={disabled}
          onPointerDown={() => (pointer.current = true)}
          onChange={(e) => {
            onChange(e.target.value)
            if (pointer.current) e.target.blur()
          }}
          onBlur={() => (pointer.current = false)}
          className="text-input text-ink-2 h-11 min-w-0 cursor-pointer appearance-none truncate bg-transparent pr-6 pl-2 [text-align-last:right] outline-none disabled:cursor-default disabled:opacity-60"
        >
          {children}
        </select>
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-ink-2 pointer-events-none absolute top-1/2 right-0 -translate-y-1/2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
    </div>
  )
}
