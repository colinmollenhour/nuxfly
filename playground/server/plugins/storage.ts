import s3 from 'unstorage/drivers/s3'

export default defineNitroPlugin(() => {
  const storage = useStorage()
  const runtimeConfig = useRuntimeConfig()
  storage.mount('nuxfly', s3({
    accessKeyId: runtimeConfig.nuxfly.s3AccessKeyId,
    secretAccessKey: runtimeConfig.nuxfly.s3SecretAccessKey,
    endpoint: runtimeConfig.nuxfly.s3Endpoint,
    bucket: runtimeConfig.nuxfly.s3Bucket,
    region: runtimeConfig.nuxfly.s3Region,
  }))
})