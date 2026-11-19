import type { ReactNode } from 'react'

/** One grouped-list section: small caps heading above a rounded surface of rows. */
export function SettingsGroup({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-6">
      <h2 id={id} className="text-foot text-ink-2 px-4 pb-2 font-semibold uppercase">
        {title}
      </h2>
      <div className="bg-surface rounded-card overflow-hidden">{children}</div>
    </section>
  )
}
