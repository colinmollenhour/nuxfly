import { defineNuxtModule, createResolver, addServerImportsDir } from '@nuxt/kit'
import { defu } from 'defu'
import type { FlyProxyHeaders, FlyProxyInfo } from './types'

// Module options TypeScript interface definition
export interface ModuleOptions {
  litestream?: boolean
  publicStorage?: boolean
  privateStorage?: boolean
}

export type { FlyProxyHeaders, FlyProxyInfo }

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxfly',
    configKey: 'nuxfly',
  },
  // Default configuration options of the Nuxt module
  defaults: {
    litestream: false,
    publicStorage: false,
    privateStorage: false,
  },
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url);
    console.log('ℹ Nuxfly module is being set up with options:', options)

    // Set up the module options in the Nuxt runtime config so it can be overridden by env vars
    nuxt.options.runtimeConfig.nuxfly = defu(nuxt.options.runtimeConfig?.nuxfly || {}, {
      dbUrl: 'file:.data/db.sqlite',
      publicBucket: {
        s3AccessKeyId: null,
        s3SecretAccessKey: null,
        s3Endpoint: null,
        s3Bucket: null,
        s3Region: 'auto',
      },
      privateBucket: {
        s3AccessKeyId: null,
        s3SecretAccessKey: null,
        s3Endpoint: null,
        s3Bucket: null,
        s3Region: 'auto',
      },
    },)
    nuxt.options.runtimeConfig.public.s3PublicUrl = nuxt.options.runtimeConfig.public.s3PublicUrl || null

    // Add composables for easy access to public and private storage server-side
    addServerImportsDir(resolve('./runtime/composables'))
  },
})
