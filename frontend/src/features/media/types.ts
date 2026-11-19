import type { components } from '../../api/schema'

export type Book = components['schemas']['Book']
export type Movie = components['schemas']['Movie']
export type MediaKind = 'book' | 'movie'

/** The fields the pure list logic reads; both Book and Movie satisfy it. */
export interface ListItem {
  id: string
  title: string
  status: 'planned' | 'seen'
  isFavorite?: boolean
  /** Source id: `draft` or a provider id; an id this client does not know is shown as is. */
  source: string
  externalId: string
  externalLink: string
  updatedAt: string
}

/** A draft is an item whose `source` is `draft` (never inferred from `externalId`, which every item has). */
export function isDraft(item: { source: string }): boolean {
  return item.source === 'draft'
}
