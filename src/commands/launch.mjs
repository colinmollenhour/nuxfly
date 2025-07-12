import { join } from 'path';
import { readFile } from 'fs/promises';
import consola from 'consola';
import { flyLaunch, executeFlyctl, executeFlyctlWithOutputInDir } from '../utils/flyctl.mjs';
import { ensureNuxflyDir, copyFile } from '../utils/filesystem.mjs';
import { validateLaunchCommand } from '../utils/validation.mjs';
import { withErrorHandling, NuxflyError } from '../utils/errors.mjs';
import { loadConfig } from '../utils/config.mjs';

/**
 * Launch command - runs fly launch and saves config to .nuxfly/fly.toml
 */
export const launch = withErrorHandling(async (args, config) => {
  consola.info('🚀 Launching new Fly.io app...');
  
  // Validate command requirements
  await validateLaunchCommand(args);
  
  // Ensure .nuxfly directory exists
  const nuxflyDir = await ensureNuxflyDir(config);
  
  // Prepare launch options
  const launchOptions = {
    name: args.name,
    region: args.region,
    noDeploy: args['no-deploy'] !== false, // Default to true (no deploy)
    noObjectStorage: true, // Skip default bucket creation
    extraArgs: [], // Will be populated with any additional args
  };
  
  // Add any extra arguments passed after --
  if (args._) {
    const dashIndex = process.argv.indexOf('--');
    if (dashIndex !== -1) {
      launchOptions.extraArgs = process.argv.slice(dashIndex + 1);
    }
  }
  
  consola.debug('Launch options:', launchOptions);
  
  try {
    // Run fly launch
    consola.info('Running fly launch...');
    await flyLaunch(launchOptions, config);
    
    // Move generated fly.toml to .nuxfly directory
    const rootFlyToml = join(process.cwd(), 'fly.toml');
    const nuxflyFlyToml = join(nuxflyDir, 'fly.toml');
    
    // Check if fly.toml was created in root
    const { fileExists } = await import('../utils/filesystem.mjs');
    if (fileExists(rootFlyToml)) {
      consola.info('Moving fly.toml to .nuxfly directory...');
      
      // Copy to .nuxfly directory
      copyFile(rootFlyToml, nuxflyFlyToml);
      
      // Remove from root directory
      const { unlink } = await import('fs/promises');
      await unlink(rootFlyToml);
      
      consola.success(`Saved fly.toml to ${nuxflyFlyToml}`);
      
      // Create SQLite volume after successful launch
      const region = await extractRegionFromFlyToml(nuxflyFlyToml);
      if (region) {
        const volumeSize = args.size || '1';
        await createSqliteVolume(region, volumeSize, config);
      } else {
        consola.warn('Could not extract region from fly.toml. Volume creation skipped.');
        consola.info('You can create the volume manually later with:');
        consola.info(`  flyctl volumes create sqlite_data --region <region> --size ${args.size || '1'}`);
      }
      
      // Create S3 buckets after successful launch
      await createS3Buckets(args.name || 'your-app', config);
    } else {
      consola.warn('No fly.toml was generated. Launch may have been cancelled or failed.');
    }
    
    // Display next steps
    displayNextSteps(args.name || 'your-app');
    
  } catch (error) {
    if (error.exitCode === 130) {
      // User cancelled (Ctrl+C)
      consola.info('Launch cancelled by user');
      return;
    }
    
    throw new NuxflyError(`Launch failed: ${error.message}`, {
      suggestion: 'Check the fly launch output above for details',
      cause: error,
    });
  }
});

/**
 * Parse fly.toml file and extract the primary region
 */
async function extractRegionFromFlyToml(flyTomlPath) {
  try {
    const flyTomlContent = await readFile(flyTomlPath, 'utf-8');
    
    // Parse the primary_region from the fly.toml file
    const regionMatch = flyTomlContent.match(/^primary_region\s*=\s*['"]([^'"]+)['"]$/m);
    
    if (regionMatch && regionMatch[1]) {
      return regionMatch[1];
    }
    
    consola.debug('No primary_region found in fly.toml');
    return null;
  } catch (error) {
    consola.debug('Failed to read or parse fly.toml:', error.message);
    return null;
  }
}

/**
 * Create SQLite volume for the app
 */
async function createSqliteVolume(region, size, config) {
  consola.info(`Creating SQLite volume (${size}GB) in region ${region}...`);
  
  try {
    const volumeArgs = ['sqlite_data', '--region', region, '--size', size];
    await executeFlyctl('volumes', ['create', ...volumeArgs], config);
    consola.success(`SQLite volume created successfully in ${region}`);
  } catch (error) {
    // Don't fail the entire launch if volume creation fails
    consola.warn(`Failed to create SQLite volume: ${error.message}`);
    consola.info('You can create the volume manually later with:');
    consola.info(`  flyctl volumes create sqlite_data --region ${region} --size ${size}`);
  }
}

/**
 * Display helpful next steps after successful launch
 */
function displayNextSteps(appName) {
  consola.box({
    title: '🎉 App launched successfully!',
    message: `Your app "${appName}" has been configured for Fly.io deployment.

Next steps:
  1. Configure your app: Edit your nuxt.config.js nuxfly section
  2. Generate deployment files: nuxfly generate
  3. Set environment variables: nuxfly secrets set KEY=value
  4. Deploy your app: nuxfly deploy

Your fly.toml is saved in .nuxfly/fly.toml for version control.`,
    style: {
      borderColor: 'green',
      padding: 1,
    },
  });
}

/**
 * Create S3 buckets based on configuration
 */
async function createS3Buckets(appName, config) {
  consola.info('🪣 Creating S3 buckets...');
  
  // Load Nuxt config to detect bucket requirements
  const nuxtConfig = await loadConfig();
  const nuxflyConfig = nuxtConfig?.nuxfly || {};
  
  // Always create litestream bucket (required for database backups)
  await createLitestreamBucket(appName, config);
  
  // Create public bucket if configured
  if (nuxflyConfig.publicBucket) {
    await createPublicBucket(appName, config);
  }
  
  // Create private bucket if configured
  if (nuxflyConfig.privateBucket) {
    await createPrivateBucket(appName, config);
  }
  
  consola.success('✅ S3 bucket creation completed!');
}

/**
 * Create litestream bucket for database backups
 */
async function createLitestreamBucket(appName, config) {
  const bucketName = `${appName}-litestream`;
  consola.info(`Creating litestream bucket: ${bucketName}`);
  
  try {
    // Create bucket from /tmp directory to avoid taking app's default slot
    const result = await executeFlyctlWithOutputInDir('storage', ['create', '--name', bucketName], config, '/tmp');
    
    // Parse the output to extract credentials
    const credentials = parseStorageCreateOutput(result.stdout);
    
    if (credentials) {
      // Set secrets with LITESTREAM_ prefix to match litestream.yml
      await setFlySecrets(config, {
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