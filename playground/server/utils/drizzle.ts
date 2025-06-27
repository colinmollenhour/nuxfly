import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from '../db/schema'

export const tables = schema

// TODO - replace this with useFlyDatabase() when available
const runtimeConfig = useRuntimeConfig()
export const sqlite = createClient({
  url: runtimeConfig.nuxfly.dbUrl,
});

const db = drizzle(sqlite, { schema })

export function useDrizzle() {
  return db
}
