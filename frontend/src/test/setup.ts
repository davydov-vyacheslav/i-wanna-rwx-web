import 'fake-indexeddb/auto'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { db } from '../db/db'

afterEach(async () => {
  cleanup()
  await db.meta.clear()
})
