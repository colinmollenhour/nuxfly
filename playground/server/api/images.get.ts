import usePublicStorage from '../../../src/runtime/composables/usePublicStorage'

export default defineEventHandler(async () => {
  const storage = usePublicStorage()
  const items = []
  try {
    const objects = storage.minioClient.listObjectsV2(storage.bucket, 'images/', false)
    for await (const item of objects) {
      console.log('Found image:', item)
      items.push(item.name)
    }
  } catch (error) {
    console.error('Error fetching images from MinIO:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch images'
    })
  }
  return items
})