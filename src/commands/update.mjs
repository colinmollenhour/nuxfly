import consola from 'consola';
import { readFileSync } from 'fs';
import { checkAppAccess } from '../utils/flyctl.mjs';
import { withErrorHandling, NuxflyError } from '../utils/errors.mjs';
import { loadConfig, getAppName, getFlyTomlPath, hasFlyToml } from '../utils/config.mjs';
import { parseFlyToml } from '../templates/fly-toml.mjs';
import { getOrgName, createLitestreamBucket, createPublicBucket, createPrivateBucket, getExistingBuckets } from '../utils/buckets.mjs';

/**
 * Get app name from fly.toml file
 */
function getAppNameFromFlyToml(config) {
  try {
    if (!hasFlyToml(config)) {
      return null;
    }
    
    const flyTomlPath = getFlyTomlPath(config);
    const flyTomlContent = readFileSync(flyTomlPath, 'utf8');
    const flyConfig = parseFlyToml(flyTomlContent);
    
    return flyConfig.app;
  } catch (error) {
    consola.debug('Failed to read app name from fly.toml:', error.message);
    return null;
  }
}

/**
 * Update command - adds missing S3 buckets based on current configuration
 */
export const update = withErrorHandling(async (args, config) => {
  consola.info('🔄 Updating S3 buckets...');
  
  // Get app name from args, fly.toml, or config (in that order)
  const appName = args.app || getAppNameFromFlyToml(config) || getAppName(config);
  if (!appName) {
    throw new NuxflyError('App name is required. Specify with --app or ensure fly.toml exists.');
  }
  
  // Validate app exists and user has access
  consola.info(`Checking access to app: ${appName}`);
  const hasAccess = await checkAppAccess(appName, config);
  if (!hasAccess) {
    throw new NuxflyError(`Cannot access app "${appName}". Make sure the app exists and you have permission.`);
  }
  
  // Get organization name for storage commands
  const orgName = await getOrgName(appName, config);
  if (!orgName) {
    throw new NuxflyError('Could not determine organization name. Make sure you have access to the app.');
  }
  consola.debug(`Using organization: ${orgName}`);
  
  // Load Nuxt config to detect bucket requirements
  const nuxtConfig = (await loadConfig()).nuxt;
  const nuxflyConfig = nuxtConfig?.nuxfly || {};
  consola.debug('Loaded nuxfly configuration:', nuxflyConfig);
  
  // Check which buckets are configured
  const needsPublicBucket = !!nuxflyConfig.publicStorage;
  const needsPrivateBucket = !!nuxflyConfig.privateStorage;
  const needsLitestreamBucket = !!nuxflyConfig.litestream;

  if (!needsPublicBucket && !needsPrivateBucket && !needsLitestreamBucket) {
    consola.info('ℹ️  No bucket configurations found in nuxt.config.');
    consola.info('Add litestream, publicStorage, or privateStorage to your nuxfly config to enable bucket creation.');
    return;
  }
  
  // Check existing buckets to avoid duplicates
  const existingBuckets = await getExistingBuckets(appName, config);
  
  let bucketsCreated = 0;
  
  // Create litestream bucket if needed and doesn't exist
  if (needsLitestreamBucket) {
    const litestreamBucketName = `${appName}-litestream`;
    if (existingBuckets.includes(litestreamBucketName)) {
      consola.info(`✅ Litestream bucket already exists: ${litestreamBucketName}`);
    } else {
      await createLitestreamBucket(appName, orgName, config);
      bucketsCreated++;
    }
  }
  
  // Create public bucket if needed and doesn't exist
  if (needsPublicBucket) {
    const publicBucketName = `${appName}-public`;
    if (existingBuckets.includes(publicBucketName)) {
      consola.info(`✅ Public bucket already exists: ${publicBucketName}`);
    } else {
      await createPublicBucket(appName, orgName, config);
      bucketsCreated++;
    }
  }
  
  // Create private bucket if needed and doesn't exist
  if (needsPrivateBucket) {
    const privateBucketName = `${appName}-private`;
    if (existingBuckets.includes(privateBucketName)) {
      consola.info(`✅ Private bucket already exists: ${privateBucketName}`);
    } else {
      await createPrivateBucket(appName, orgName, config);
      bucketsCreated++;
    }
  }
  
  if (bucketsCreated > 0) {
    consola.success(`🎉 Successfully created ${bucketsCreated} bucket(s)!`);
    consola.info('💡 Deploy your app to use the new bucket configurations.');
  } else {
    consola.info('✅ All configured buckets already exist.');
  }
});
