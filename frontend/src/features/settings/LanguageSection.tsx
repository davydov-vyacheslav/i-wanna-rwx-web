import type { ApiClient } from '../../api/client'
import { SelectRow } from '../../components/SelectRow'
import { t, type Locale } from '../../i18n'
import { useUpdateSettings } from './useSettings'

/** Each language is shown in its own language and is never translated. */
const LANGUAGES: { id: Locale; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'ru', name: 'Русский' },
  { id: 'uk', name: 'Українська' },
]

/** `locale` is the effective UI locale (the stored one). A failed save keeps it, the error is shown by the section. */
export function LanguageRow({ api, locale }: { api?: ApiClient; locale: Locale }) {
  const update = useUpdateSettings(api)
  return (
    <>
      <SelectRow
        label={t(locale, 'settings.language')}
        value={locale}
        disabled={update.isPending}
        onChange={(id) => update.mutate({ locale: id as Locale })}
      >
        {LANGUAGES.map((l) => (
          <option key={l.id} value={l.id} lang={l.id}>
            {l.name}
          </option>
        ))}
      </SelectRow>
      {update.isError && (
        <p role="alert" className="text-danger bg-danger-bg text-body px-4 py-2">
          {t(locale, 'settings.saveFailed')}
        </p>
      )}
    </>
  )
}
