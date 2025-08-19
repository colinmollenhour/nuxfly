# @nuxfly/core

A Nuxt module that provides seamless integration with Fly.io infrastructure, including SQLite databases and S3 storage.

> [!WARNING]
> This project is in early development and may not be fully functional yet.

## Features

- 🗄️ **SQLite Database** - libSQL integration with automatic connection management
- 📦 **S3 Storage** - Public and private file storage with Minio client for elegant API - pre-signed URLs support
- 🔧 **Fly.io Integration** - Access to Fly.io proxy headers through `useFlyProxy()` composable
- 🎯 **TypeScript Support** - Full type safety
- ⚡ **Server-side Ready** - Optimized for Nuxt server-side rendering
- 🔄 **Easy Configuration** - Automatic setup based on environment variables

## Installation

```bash
npm install @nuxfly/core
```

## Setup

Update your `nuxt.config.ts` file:

1. Add the module to your `modules` array.
2. Set which services to enable in the `nuxfly` top-level configuration.
3. Set your default values for the `runtimeConfig`. Since the runtime config can be overridden by environment variables,
   you can set them in your deployment environment (e.g., Fly.io secrets) but use testing/local values hard-coded in the `nuxt.config.ts` for local development.

```typescript
export default defineNuxtConfig({
  modules: ['@nuxfly/core'],
  nuxfly: {
    litestream: true,      // Enable SQLite with Litestream backup
    publicStorage: true,   // Enable public S3 storage
    privateStorage: true,  // Enable private S3 storage
  },
  runtimeConfig: {
    nuxfly: {
      publicBucket: {
        s3AccessKeyId: 'AAAAAAAAAAAAAAAAAAAA',
        s3SecretAccessKey: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        s3Endpoint: 'http://localhost:8200',
        s3Bucket: 'nuxfly-public',
        s3Region: 'auto',
      },
      privateBucket: {
        s3AccessKeyId: 'AAAAAAAAAAAAAAAAAAAA',
        s3SecretAccessKey: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        s3Endpoint: 'http://localhost:8200',
        s3Bucket: 'nuxfly-private',
        s3Region: 'auto',
      },
    },
    public: {
      s3PublicUrl: 'http://localhost:8200/nuxfly-public',
    },
  }
})
```

## Environment Variables

The module uses Nuxt runtime configuration, so the environment variables supported are just mapped from the `runtimeConfig`:

- `NUXT_NUXFLY_PUBLIC_BUCKET_S3_ACCESS_KEY_ID`
- `NUXT_NUXFLY_PUBLIC_BUCKET_S3_SECRET_ACCESS_KEY`
- `NUXT_NUXFLY_PUBLIC_BUCKET_S3_ENDPOINT`
- `NUXT_NUXFLY_PUBLIC_BUCKET_S3_BUCKET`
- `NUXT_NUXFLY_PUBLIC_BUCKET_S3_REGION`
- `NUXT_NUXFLY_PRIVATE_BUCKET_S3_ACCESS_KEY_ID`
- `NUXT_NUXFLY_PRIVATE_BUCKET_S3_SECRET_ACCESS_KEY`
- `NUXT_NUXFLY_PRIVATE_BUCKET_S3_ENDPOINT`
- `NUXT_NUXFLY_PRIVATE_BUCKET_S3_BUCKET`
- `NUXT_NUXFLY_PRIVATE_BUCKET_S3_REGION`
- `NUXT_PUBLIC_S3_PUBLIC_URL`

## TypeScript Support

The module provides full TypeScript support with auto-completion:

```typescript
// Auto-completion for all composables
const { db } = useSqliteDatabase()
const { minioClient, bucket, getUrl } = usePublicStorage()
const { minioClient, bucket } = usePrivateStorage()
```

## Documentation

For detailed documentation and examples, visit: [nuxfly documentation](https://nuxfly.pages.dev)

## License

MIT