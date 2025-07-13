import consola from 'consola';
import { executeFlyctlWithOutputInDir, executeFlyctlWithOutput, executeFlyctl } from './flyctl.mjs';
import { loadConfig } from './config.mjs';

/**
 * Get organization name from flyctl status
 */
export async function getOrgName(config) {
  try {
    const result = await executeFlyctlWithOutput('status', [], config);
    
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
 * Parse flyctl storage create output to extract credentials
 */
export function parseStorageCreateOutput(output) {
  try {
    const lines = output.split('\n');
    const credentials = {};
    
    for (const line of lines) {
      if (line.includes('AWS_ACCESS_KEY_ID:')) {
        credentials.accessKeyId = line.split(':', 2)[1].trim();
      } else if (line.includes('AWS_SECRET_ACCESS_KEY:')) {
        credentials.secretAccessKey = line.split(':', 2)[1].trim();
      } else if (line.includes('AWS_ENDPOINT_URL_S3:')) {
        credentials.endpointUrl = line.split(':', 2)[1].trim();
      } else if (line.includes('AWS_REGION:')) {
        credentials.region = line.split(':', 2)[1].trim();
      } else if (line.includes('BUCKET_NAME:')) {
        credentials.bucketName = line.split(':', 2)[1].trim();
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
export async function setFlySecrets(appName, config, secrets) {
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

/**
 * Create litestream bucket for database backups
 */
export async function createLitestreamBucket(orgName, config) {
  const bucketName = `${config.app}-litestream`;
  consola.info(`Creating litestream bucket: ${bucketName}`);
  
  try {
    // Create bucket from /tmp directory to avoid taking app's default slot
    const result = await executeFlyctlWithOutputInDir('storage', ['create', '--name', bucketName, '--org', orgName], config, '/tmp');
    
    // Parse the output to extract credentials
    const credentials = parseStorageCreateOutput(result.stdout);
    
    if (credentials) {
      // Set secrets with LITESTREAM_ prefix to match litestream.yml
      await setFlySecrets(config.app, config, {
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
 * Create public bucket for public assets
 */
export async function createPublicBucket(orgName, config) {
  const bucketName = `${config.app}-public`;
  consola.info(`Creating public bucket: ${bucketName}`);
  
  try {
    // Create public bucket from /tmp directory
    const result = await executeFlyctlWithOutputInDir('storage', ['create', '--name', bucketName, '--org', orgName, '--public'], config, '/tmp');
    
    // Parse the output to extract credentials
    const credentials = parseStorageCreateOutput(result.stdout);
    
    if (credentials) {
      // Set secrets with NUXT_NUXFLY_PUBLIC_BUCKET_S3_ prefix to override runtime config
      await setFlySecrets(config.app, config, {
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
export async function createPrivateBucket(orgName, config) {
  const bucketName = `${config.app}-private`;
  consola.info(`Creating private bucket: ${bucketName}`);
  
  try {
    // Create private bucket from /tmp directory
    const result = await executeFlyctlWithOutputInDir('storage', ['create', '--name', bucketName, '--org', orgName], config, '/tmp');
    
    // Parse the output to extract credentials
    const credentials = parseStorageCreateOutput(result.stdout);
    
    if (credentials) {
      // Set secrets with NUXT_NUXFLY_PRIVATE_BUCKET_S3_ prefix to override runtime config
      await setFlySecrets(config.app, config, {
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
 * Create S3 buckets based on configuration
 */
export async function createS3Buckets(config) {
}

/**
 * Get list of existing storage buckets for the app
 */
export async function getExistingBuckets(config) {
  try {
    consola.debug('Checking existing storage buckets...');
    const result = await executeFlyctlWithOutput('storage', ['list'], config);
    
    // Parse the output to extract bucket names
    const buckets = [];
    const lines = result.stdout.split('\n');
    
    for (const line of lines) {
      // Look for lines that contain bucket names (typically in a table format)
      // This is a simple parser - may need adjustment based on actual flyctl output format
      if (line.includes(config.app) && (line.includes('-public') || line.includes('-private') || line.includes('-litestream'))) {
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