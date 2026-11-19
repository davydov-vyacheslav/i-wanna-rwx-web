import type { MessageKey } from '../../i18n'

/** Where a user gets the key of a source and how to say it; sources without an entry show only the generic hint. */
export const KEY_HELP: Record<string, { url: string; message: MessageKey }> = {
  tmdb: { url: 'https://www.themoviedb.org/settings/api', message: 'sources.keyHelp.tmdb' },
}
