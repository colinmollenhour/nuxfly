// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },

  modules: [
    '@nuxt/ui',
    '@nuxt/eslint'
  ],

  css: ['~/assets/css/main.css'],

  future: {
    compatibilityVersion: 4
  },

  runtimeConfig: {
    nuxfly: {
      dbUrl: 'file:.data/db.sqlite',
      publicBucket: {
        s3AccessKeyId: 'AAAAAAAAAAAAAAAAAAAA',
        s3SecretAccessKey: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        s3Endpoint: 'http://localhost:8200',
        s3Bucket: 'nuxfly-public',
        s3Region: 'auto',
      },
      privateBucket: {
        s3AccessKeyId: 'CCCCCCCCCCCCCCCCCCCC',
        s3SecretAccessKey: 'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
        s3Endpoint: 'http://localhost:8200',
        s3Bucket: 'nuxfly-private',
        s3Region: 'auto',
      },
    },
    public: {
      s3PublicUrl: 'http://localhost:8200/nuxfly',
    },
  },
})
