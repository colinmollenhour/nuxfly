export default defineEventHandler(async () => {
  const storage = useStorage('nuxfly-public')
  const keys = await storage.getKeys()
  return keys
})