import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { openDb, type RwxDb } from './db'

const DbContext = createContext<RwxDb | null>(null)

/** Provides the db of `userId`; closes the handle on unmount or user change (logout). */
export function DbProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const db = useMemo(() => openDb(userId), [userId])
  useEffect(() => {
    // explicit open() re-enables the handle after StrictMode's simulated unmount
    db.open().catch(() => undefined)
    return () => db.close()
  }, [db])
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>
}

export function useDb(): RwxDb {
  const db = useContext(DbContext)
  if (!db) throw new Error('useDb must be used inside DbProvider')
  return db
}
