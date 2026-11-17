import Dexie, { type EntityTable } from 'dexie'

export interface MetaRow {
  key: string
  value: unknown
}

export type RwxDb = Dexie & { meta: EntityTable<MetaRow, 'key'> }

export function dbName(userId: string): string {
  return `rwx-${userId}`
}

/** Opens the per-user database. Local data is a cache only; one database per user id. */
export function openDb(userId: string): RwxDb {
  const db = new Dexie(dbName(userId)) as RwxDb
  db.version(1).stores({ meta: 'key' })
  return db
}
