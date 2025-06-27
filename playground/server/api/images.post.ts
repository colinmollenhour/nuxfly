import { randomUUID } from 'node:crypto'

export default defineEventHandler(async (event) => {
  const file = await readMultipartFormData(event)
  if (!file) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No file provided'
    })
  }

  const storage = useStorage('nuxfly')
  const key = randomUUID()
  await storage.setItemRaw(key, file[0].data)

  return {
    key
  }
})