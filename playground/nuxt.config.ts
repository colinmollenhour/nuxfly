// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },

  modules: [
    '@nuxt/ui',
    '@nuxt/eslint',
    '../src/module',
  ],

  css: ['~/assets/css/main.css'],

  future: {
    compatibilityVersion: 4
  },

  nuxfly: {
    litestream: true,
    publicStorage: true,
    privateStorage: false,
  },
  
  runtimeConfig: {
    nuxfly: {
      //dbUrl: 'file:.data/db.sqlite',
      publicBucket: {
        s3AccessKeyId: 'AAAAAAAAAAAAAAAAAAAA',
        s3SecretAccessKey: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        s3Endpoint: 'http://localhost:8200', // Wiretap endpoint
        s3Bucket: 'nuxfly',
        s3Region: 'auto',
      },
      // privateBucket: {
      //   // s3AccessKeyId: 'AAAAAAAAAAAAAAAAAAAA',
      //   // s3SecretAccessKey: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      //   // s3Endpoint: 'http://localhost:8200',
      //   // s3Bucket: 'nuxfly',
      //   // s3Region: 'auto',
      // },
    },
    public: {
      s3PublicUrl: 'http://localhost:8200/nuxfly',
    },
  },
})
