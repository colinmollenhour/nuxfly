import * as Minio from 'minio'
import { useRuntimeConfig } from '#imports'

let minioClient: Minio.Client
let bucket: string
let baseUrl: string

export default function usePublicStorage() {
  if (!minioClient) {
    const config = useRuntimeConfig()
    const nuxflyConfig = config.nuxfly || {}
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
    baseUrl = config.public.s3PublicUrl?.trim().replace(/\/$/, '') || `${endpointUrl}/${bucket}`
  }
  function getUrl(path: string): URL {
    return new URL(`${baseUrl}/${path.trim().replace(/^\//, '')}`)
  }
  return {
    minioClient,
    bucket,
    getUrl,
  }
}
