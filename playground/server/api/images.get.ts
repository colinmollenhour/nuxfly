export default defineEventHandler(async () => {
  const storage = useStorage('nuxfly')
  const keys = await storage.getKeys()
  return keys
})