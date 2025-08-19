import * as Minio from 'minio'
import { useRuntimeConfig } from '#imports'

let minioClient: Minio.Client
let bucket: string

export default function usePrivateStorage() {
  if (!minioClient) {
    const nuxflyConfig = useRuntimeConfig().nuxfly || {}
    const endpointUrl = new URL(nuxflyConfig.privateBucket.s3Endpoint)
    minioClient = new Minio.Client({
      endPoint: endpointUrl.hostname,
      port: endpointUrl.port ? parseInt(endpointUrl.port) : (endpointUrl.protocol === 'https:' ? 443 : 80),
      useSSL: endpointUrl.protocol === 'https:',
      accessKey: nuxflyConfig.privateBucket.s3AccessKeyId,
      secretKey: nuxflyConfig.privateBucket.s3SecretAccessKey,
      region: nuxflyConfig.privateBucket.s3Region || 'auto',
      pathStyle: true,
    })
    bucket = nuxflyConfig.privateBucket.s3Bucket
  }
  return {
    minioClient,
    bucket,
  }
}
