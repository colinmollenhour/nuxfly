import { createClient } from '@libsql/client'
import { useRuntimeConfig } from '#imports'

let db: ReturnType<typeof createClient> | undefined

export const useSqliteDatabase = () => {
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
