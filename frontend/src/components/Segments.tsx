/** Segmented control: a group of toggle buttons, one selected. Taps always report the key; the caller decides what a repeat tap means. */
export function Segments<K extends string>({
  label,
  options,
  value,
  onSelect,
  className = '',
}: {
  label: string
  options: readonly { key: K; label: string }[]
  value: K
  onSelect: (key: K) => void
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={`bg-surface-2 flex gap-0.5 rounded-md p-0.5 ${className}`}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onSelect(o.key)}
          className={`text-body min-h-11 flex-1 truncate rounded-sm px-2 font-semibold ${value === o.key ? 'bg-segment-on text-ink shadow-sm' : 'text-ink-2'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
