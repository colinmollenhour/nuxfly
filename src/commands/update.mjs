import consola from 'consola';
import { readFileSync } from 'fs';
import { executeFlyctlWithOutput, executeFlyctlWithOutputInDir, executeFlyctl, checkAppAccess } from '../utils/flyctl.mjs';
import { withErrorHandling, NuxflyError } from '../utils/errors.mjs';
import { loadConfig, getAppName, getFlyTomlPath, hasFlyToml } from '../utils/config.mjs';
import { parseFlyToml } from '../templates/fly-toml.mjs';

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
 * Get organization name from flyctl status
 */
async function getOrgName(appName, config) {
  try {
    const result = await executeFlyctlWithOutput('status', ['--app', appName], config);
    
    // Parse the output to extract organization name
    const lines = result.stdout.split('\n');
    for (const line of lines) {
      if (line.includes('Owner')) {
        const match = line.match(/Owner\s*=\s*(.+)/);
        if (match) {
          return match[1].trim();
        }
      }
    }
    
    consola.debug('Could not find organization name in status output');
    return null;
  } catch (error) {
    consola.debug('Failed to get organization name:', error.message);
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

/**
 * Get list of existing storage buckets for the app
 */
async function getExistingBuckets(appName, config) {
  try {
    consola.debug('Checking existing storage buckets...');
    const result = await executeFlyctlWithOutput('storage', ['list'], config);
    
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
async function createPublicBucket(appName, orgName, config) {
  const bucketName = `${appName}-public`;
  consola.info(`Creating public bucket: ${bucketName}`);
  
  try {
    // Create public bucket from /tmp directory
    const result = await executeFlyctlWithOutputInDir('storage', ['create', '--name', bucketName, '--org', orgName, '--public'], config, '/tmp');
    
    // Parse the output to extract credentials
    const credentials = parseStorageCreateOutput(result.stdout);
    
    if (credentials) {
      // Set secrets with NUXT_NUXFLY_PUBLIC_BUCKET_S3_ prefix to override runtime config
      await setFlySecrets(appName, config, {
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
async function createPrivateBucket(appName, orgName, config) {
  const bucketName = `${appName}-private`;
  consola.info(`Creating private bucket: ${bucketName}`);
  
  try {
    // Create private bucket from /tmp directory
    const result = await executeFlyctlWithOutputInDir('storage', ['create', '--name', bucketName, '--org', orgName], config, '/tmp');
    
    // Parse the output to extract credentials
    const credentials = parseStorageCreateOutput(result.stdout);
    
    if (credentials) {
      // Set secrets with NUXT_NUXFLY_PRIVATE_BUCKET_S3_ prefix to override runtime config
      await setFlySecrets(appName, config, {
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
 * Create litestream bucket for database backups
 */
async function createLitestreamBucket(appName, orgName, config) {
  const bucketName = `${appName}-litestream`;
  consola.info(`Creating litestream bucket: ${bucketName}`);
  
  try {
    // Create bucket from /tmp directory to avoid taking app's default slot
    const result = await executeFlyctlWithOutputInDir('storage', ['create', '--name', bucketName, '--org', orgName], config, '/tmp');
    
    // Parse the output to extract credentials
    const credentials = parseStorageCreateOutput(result.stdout);
    
    if (credentials) {
      // Set secrets with LITESTREAM_ prefix to match litestream.yml
      await setFlySecrets(appName, config, {
        'LITESTREAM_S3_ACCESS_KEY_ID': credentials.accessKeyId,
        'LITESTREAM_S3_SECRET_ACCESS_KEY': credentials.secretAccessKey,
        'LITESTREAM_S3_ENDPOINT_URL': credentials.endpointUrl,
        'LITESTREAM_S3_REGION': credentials.region,
        'LITESTREAM_S3_BUCKET_NAME': credentials.bucketName,
      });
      
      consola.success(`✅ Litestream bucket created: ${bucketName}`);
    } else {
      consola.warn('Failed to parse litestream bucket credentials');
    }
  } catch (error) {
    consola.error(`Failed to create litestream bucket: ${error.message}`);
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
async function setFlySecrets(appName, config, secrets) {
  const secretArgs = [];
  
  for (const [key, value] of Object.entries(secrets)) {
    secretArgs.push(`${key}=${value}`);
  }
  
  try {
    await executeFlyctl('secrets', ['set', ...secretArgs, '--app', appName, '--stage'], config);
    consola.debug(`Set ${Object.keys(secrets).length} secrets`);
  } catch (error) {
    consola.error(`Failed to set secrets: ${error.message}`);
    throw error;
  }
}