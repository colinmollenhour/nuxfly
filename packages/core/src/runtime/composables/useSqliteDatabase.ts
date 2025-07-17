import { createClient } from '@libsql/client'

let db: ReturnType<typeof createClient> | undefined

export default function useSqliteDatabase() {
  if (!db) {
    const nuxflyConfig = useRuntimeConfig().nuxfly || {}
    if (!nuxflyConfig.dbUrl) {
      throw new Error('Database URL is not configured in nuxfly configuration.')
    }
    db = createClient({
      url: nuxflyConfig.dbUrl,
    });

  }
  return {
    db,
  }
}
