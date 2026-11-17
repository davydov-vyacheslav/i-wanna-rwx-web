import Dexie, { type EntityTable } from 'dexie'

export interface MetaRow {
  key: string
  value: unknown
}

export const db = new Dexie('rwx') as Dexie & { meta: EntityTable<MetaRow, 'key'> }
db.version(1).stores({ meta: 'key' })
