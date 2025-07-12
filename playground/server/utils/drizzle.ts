import useSqliteDatabase from '../../../src/runtime/composables/useSqliteDatabase'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../db/schema'

export const tables = schema
const db = drizzle(useSqliteDatabase().db, { schema })

export function useDrizzle() {
  return db
}
