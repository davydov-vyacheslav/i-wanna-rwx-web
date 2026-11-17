import { en, type Messages } from './en'
import { ru } from './ru'
import { uk } from './uk'

export type Locale = 'en' | 'ru' | 'uk'
export type MessageKey = keyof Messages

const catalogues: Record<Locale, Messages> = { en, ru, uk }

/** Picks a supported locale from a BCP 47 tag list; falls back to English. */
export function detectLocale(languages: readonly string[] = navigator.languages ?? [navigator.language]): Locale {
  for (const tag of languages) {
    const base = tag.toLowerCase().split('-')[0]
    if (base === 'en' || base === 'ru' || base === 'uk') return base
  }
  return 'en'
}

export function t(locale: Locale, key: MessageKey): string {
  return catalogues[locale][key]
}
