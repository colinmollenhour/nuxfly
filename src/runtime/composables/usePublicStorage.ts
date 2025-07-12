import * as Minio from 'minio'

let minioClient: Minio.Client
let bucket: string

export default function usePublicStorage() {
  if (!minioClient) {
    const nuxflyConfig = useRuntimeConfig().nuxfly || {}
    console.log('ℹ Initializing public storage with configuration:', nuxflyConfig.publicBucket)
    const endpointUrl = new URL(nuxflyConfig.publicBucket.s3Endpoint)
    minioClient = new Minio.Client({
      endPoint: endpointUrl.hostname,
      port: endpointUrl.port ? parseInt(endpointUrl.port) : (endpointUrl.protocol === 'https:' ? 443 : 80),
      useSSL: endpointUrl.protocol === 'https:',
      accessKey: nuxflyConfig.publicBucket.s3AccessKeyId,
      secretKey: nuxflyConfig.publicBucket.s3SecretAccessKey,
      region: nuxflyConfig.publicBucket.s3Region || 'auto',
      pathStyle: true,
    })
    bucket = nuxflyConfig.publicBucket.s3Bucket
  }
  return {
    minioClient,
    bucket,
  }
}
