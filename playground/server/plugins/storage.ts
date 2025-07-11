import s3 from 'unstorage/drivers/s3'

export default defineNitroPlugin(() => {
  const storage = useStorage()
  const runtimeConfig = useRuntimeConfig()
  if (runtimeConfig.nuxfly?.privateBucket?.s3AccessKeyId) {
    storage.mount('nuxfly-private', s3({
      accessKeyId: runtimeConfig.nuxfly.privateBucket.s3AccessKeyId,
      secretAccessKey: runtimeConfig.nuxfly.privateBucket.s3SecretAccessKey,
      endpoint: runtimeConfig.nuxfly.privateBucket.s3Endpoint,
      bucket: runtimeConfig.nuxfly.privateBucket.s3Bucket,
      region: runtimeConfig.nuxfly.privateBucket.s3Region,
    }))
  }
  if (runtimeConfig.nuxfly?.publicBucket?.s3AccessKeyId) {
    storage.mount('nuxfly-public', s3({
      accessKeyId: runtimeConfig.nuxfly.publicBucket.s3AccessKeyId,
      secretAccessKey: runtimeConfig.nuxfly.publicBucket.s3SecretAccessKey,
      endpoint: runtimeConfig.nuxfly.publicBucket.s3Endpoint,
      bucket: runtimeConfig.nuxfly.publicBucket.s3Bucket,
      region: runtimeConfig.nuxfly.publicBucket.s3Region,
    }))
  }
})