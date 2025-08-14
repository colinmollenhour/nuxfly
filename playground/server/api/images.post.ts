import { randomUUID } from 'node:crypto'
import usePublicStorage from '../../../packages/core/src/runtime/composables/usePublicStorage'

export default defineEventHandler(async (event) => {
  const file = await readMultipartFormData(event)
  if (!file) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No file provided'
    })
  }

  const storage = usePublicStorage()
  const key = `images/${randomUUID()}`
  const metadata = {
    'Content-Type': file[0].type,
  }
  try {
    const response = await storage.minioClient.putObject(storage.bucket, key, file[0].data, file[0].data.length, metadata)
    console.log('✔ File uploaded successfully:', response)
  } catch (error) {
    console.error('Error uploading file to MinIO:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to upload file'
    })
  }

  return {
    key
  }
})