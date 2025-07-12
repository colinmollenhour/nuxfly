import consola from 'consola';
import { executeFlyctlWithOutput, executeFlyctlWithOutputInDir, executeFlyctl, checkAppAccess } from '../utils/flyctl.mjs';
import { withErrorHandling, NuxflyError } from '../utils/errors.mjs';
import { loadConfig, getAppName } from '../utils/config.mjs';

/**
 * Update command - adds missing S3 buckets based on current configuration
 */
export const update = withErrorHandling(async (args, config) => {
  consola.info('🔄 Updating S3 buckets...');
  
  // Get app name from config or args
  const appName = args.app || getAppName(config);
  if (!appName) {
    throw new NuxflyError('App name is required. Specify with --app or ensure fly.toml exists.');
  }
  
  // Validate app exists and user has access
  consola.info(`Checking access to app: ${appName}`);
  const hasAccess = await checkAppAccess(appName, config);
  if (!hasAccess) {
    throw new NuxflyError(`Cannot access app "${appName}". Make sure the app exists and you have permission.`);
  }
  
  // Load Nuxt config to detect bucket requirements
  const nuxtConfig = await loadConfig();
  const nuxflyConfig = nuxtConfig?.nuxfly || {};
  
  // Check which buckets are configured
  const needsPublicBucket = !!nuxflyConfig.publicBucket;
  const needsPrivateBucket = !!nuxflyConfig.privateBucket;
  
  if (!needsPublicBucket && !needsPrivateBucket) {
    consola.info('ℹ️  No public or private bucket configurations found in nuxt.config.');
    consola.info('Add publicBucket or privateBucket to your nuxfly config to enable bucket creation.');
    return;
  }
  
  // Check existing buckets to avoid duplicates
  const existingBuckets = await getExistingBuckets(appName, config);
  
  let bucketsCreated = 0;
  
  // Create public bucket if needed and doesn't exist
  if (needsPublicBucket) {
    const publicBucketName = `${appName}-public`;
    if (existingBuckets.includes(publicBucketName)) {
      consola.info(`✅ Public bucket already exists: ${publicBucketName}`);
    } else {
      await createPublicBucket(appName, config);
      bucketsCreated++;
    }
  }
  
  // Create private bucket if needed and doesn't exist
  if (needsPrivateBucket) {
    const privateBucketName = `${appName}-private`;
    if (existingBuckets.includes(privateBucketName)) {
      consola.info(`✅ Private bucket already exists: ${privateBucketName}`);
    } else {
      await createPrivateBucket(appName, config);
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

/**
 * Get list of existing storage buckets for the app
 */
async function getExistingBuckets(appName, config) {
  try {
    consola.debug('Checking existing storage buckets...');
    const result = await executeFlyctlWithOutput('storage', ['list', '--app', appName], config);
    
    // Parse the output to extract bucket names
    const buckets = [];
    const lines = result.stdout.split('\n');
    
    for (const line of lines) {
      // Look for lines that contain bucket names (typically in a table format)
      // This is a simple parser - may need adjustment based on actual flyctl output format
      if (line.includes(appName) && (line.includes('-public') || line.includes('-private') || line.includes('-litestream'))) {
        const match = line.match(/(\S+(?:-public|-private|-litestream))/);
        if (match) {
          buckets.push(match[1]);
        }
      }
    }
    
    consola.debug('Found existing buckets:', buckets);
    return buckets;
  } catch (error) {
    consola.debug('Failed to list existing buckets:', error.message);
    // If we can't list buckets, assume none exist to be safe
    return [];
  }
}

/**
 * Create public bucket for public assets
 */
async function createPublicBucket(appName, config) {
  const bucketName = `${appName}-public`;
  consola.info(`Creating public bucket: ${bucketName}`);
  
  try {
    // Create public bucket from /tmp directory
    const result = await executeFlyctlWithOutputInDir('storage', ['create', '--name', bucketName, '--public'], config, '/tmp');
    
    // Parse the output to extract credentials
    const credentials = parseStorageCreateOutput(result.stdout);
    
    if (credentials) {
      // Set secrets with NUXT_NUXFLY_PUBLIC_BUCKET_S3_ prefix to override runtime config
      await setFlySecrets(config, {
        'NUXT_NUXFLY_PUBLIC_BUCKET_S3_ACCESS_KEY_ID': credentials.accessKeyId,
        'NUXT_NUXFLY_PUBLIC_BUCKET_S3_SECRET_ACCESS_KEY': credentials.secretAccessKey,
        'NUXT_NUXFLY_PUBLIC_BUCKET_S3_ENDPOINT': credentials.endpointUrl,
        'NUXT_NUXFLY_PUBLIC_BUCKET_S3_BUCKET': credentials.bucketName,
        'NUXT_NUXFLY_PUBLIC_BUCKET_S3_REGION': credentials.region,
      });
      
      consola.success(`✅ Public bucket created: ${bucketName}`);
    } else {
      consola.warn('Failed to parse public bucket credentials');
    }
  } catch (error) {
    consola.error(`Failed to create public bucket: ${error.message}`);
    throw error;
  }
}

/**
 * Create private bucket for private storage
 */
async function createPrivateBucket(appName, config) {
  const bucketName = `${appName}-private`;
  consola.info(`Creating private bucket: ${bucketName}`);
  
  try {
    // Create private bucket from /tmp directory
    const result = await executeFlyctlWithOutputInDir('storage', ['create', '--name', bucketName], config, '/tmp');
    
    // Parse the output to extract credentials
    const credentials = parseStorageCreateOutput(result.stdout);
    
    if (credentials) {
      // Set secrets with NUXT_NUXFLY_PRIVATE_BUCKET_S3_ prefix to override runtime config
      await setFlySecrets(config, {
        'NUXT_NUXFLY_PRIVATE_BUCKET_S3_ACCESS_KEY_ID': credentials.accessKeyId,
        'NUXT_NUXFLY_PRIVATE_BUCKET_S3_SECRET_ACCESS_KEY': credentials.secretAccessKey,
        'NUXT_NUXFLY_PRIVATE_BUCKET_S3_ENDPOINT': credentials.endpointUrl,
        'NUXT_NUXFLY_PRIVATE_BUCKET_S3_BUCKET': credentials.bucketName,
        'NUXT_NUXFLY_PRIVATE_BUCKET_S3_REGION': credentials.region,
      });
      
      consola.success(`✅ Private bucket created: ${bucketName}`);
    } else {
      consola.warn('Failed to parse private bucket credentials');
    }
  } catch (error) {
    consola.error(`Failed to create private bucket: ${error.message}`);
    throw error;
  }
}

/**
 * Parse flyctl storage create output to extract credentials
 */
function parseStorageCreateOutput(output) {
  try {
    const lines = output.split('\n');
    const credentials = {};
    
    for (const line of lines) {
      if (line.includes('AWS_ACCESS_KEY_ID:')) {
        credentials.accessKeyId = line.split(':')[1].trim();
      } else if (line.includes('AWS_SECRET_ACCESS_KEY:')) {
        credentials.secretAccessKey = line.split(':')[1].trim();
      } else if (line.includes('AWS_ENDPOINT_URL_S3:')) {
        credentials.endpointUrl = line.split(':')[1].trim();
      } else if (line.includes('AWS_REGION:')) {
        credentials.region = line.split(':')[1].trim();
      } else if (line.includes('BUCKET_NAME:')) {
        credentials.bucketName = line.split(':')[1].trim();
      }
    }
    
    // Validate that we have all required credentials
    if (credentials.accessKeyId && credentials.secretAccessKey && 
        credentials.endpointUrl && credentials.region && credentials.bucketName) {
      return credentials;
    }
    
    return null;
  } catch (error) {
    consola.debug('Failed to parse storage create output:', error.message);
    return null;
  }
}

/**
 * Set multiple Fly secrets
 */
async function setFlySecrets(config, secrets) {
  const secretArgs = [];
  
  for (const [key, value] of Object.entries(secrets)) {
    secretArgs.push(`${key}=${value}`);
  }
  
  try {
    await executeFlyctl('secrets', ['set', ...secretArgs], config);
    consola.debug(`Set ${Object.keys(secrets).length} secrets`);
  } catch (error) {
    consola.error(`Failed to set secrets: ${error.message}`);
    throw error;
  }
}