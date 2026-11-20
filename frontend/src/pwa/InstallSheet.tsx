import type { ReactNode } from 'react'
import { Sheet } from '../components/Sheet'
import { AddToHomeIcon, CheckIcon, ShareIcon } from '../features/media/icons'
import { t, type Locale } from '../i18n'

/** iOS/iPadOS walkthrough: no screenshots, they drift with iOS versions. Shared by the Settings row and the sign-in link. */
export function InstallSheet({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const steps: { text: string; glyph: ReactNode }[] = [
    { text: t(locale, 'install.step1'), glyph: <ShareIcon size={24} /> },
    { text: t(locale, 'install.step2'), glyph: <AddToHomeIcon size={24} /> },
    { text: t(locale, 'install.step3'), glyph: <CheckIcon size={24} /> },
  ]
  return (
    <Sheet
      title={t(locale, 'install.title')}
      closeLabel={t(locale, 'install.done')}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="bg-accent text-on-accent text-input min-h-11 w-full rounded-md font-semibold active:opacity-80"
        >
          {t(locale, 'install.done')}
        </button>
      }
    >
      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className="bg-accent-soft text-accent text-chip flex size-7 shrink-0 items-center justify-center rounded-full font-semibold">
              {i + 1}
            </span>
            <span className="text-body min-w-0 flex-1">{s.text}</span>
            <span aria-hidden="true" className="text-accent shrink-0">
              {s.glyph}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-foot text-ink-2 mt-4">{t(locale, 'install.note')}</p>
    </Sheet>
  )
}
