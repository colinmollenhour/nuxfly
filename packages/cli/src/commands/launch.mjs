import { join, basename } from 'path';
import { readFile } from 'fs/promises';
import consola from 'consola';
import { flyLaunch, executeFlyctl } from '../utils/flyctl.mjs';
import { ensureNuxflyDir, fileExists, writeFile } from '../utils/filesystem.mjs';
import { validateLaunchCommand } from '../utils/validation.mjs';
import { withErrorHandling, NuxflyError } from '../utils/errors.mjs';
import { getExistingBuckets, getOrgName, createLitestreamBucket, createPrivateBucket, createPublicBucket } from '../utils/buckets.mjs';
import { generateDockerfile, generateDockerignore } from '../templates/dockerfile.mjs';
import { generateFlyToml } from '../templates/fly-toml.mjs';
import { loadConfig, getEnvironmentSpecificFlyTomlPath } from '../utils/config.mjs';

/**
 * Launch command - runs fly launch and saves config to environment-specific fly.toml
 */
export const launch = withErrorHandling(async (args, config) => {
  consola.info('🚀 Launching new Fly.io app...');
  
  // Validate command requirements
  await validateLaunchCommand(args);
  
  // Ensure .nuxfly directory exists
  const nuxflyDir = await ensureNuxflyDir(config);
  
  // Check if environment-specific fly.toml already exists
  const envFlyToml = getEnvironmentSpecificFlyTomlPath();
  if (envFlyToml && fileExists(envFlyToml)) {
    // Check if the app actually exists on Fly.io
    try {
      const { checkAppAccess } = await import('../utils/validation.mjs');
      const appName = args.name || (process.env.NUXFLY_ENV && process.env.NUXFLY_ENV !== 'prod'
        ? `${config.app || 'nuxfly-app'}-${process.env.NUXFLY_ENV}`
        : config.app || 'nuxfly-app');
      
      await checkAppAccess(appName, config);
      
      // If we get here, the app exists on Fly.io
      consola.error('❌ App already exists on Fly.io!');
      consola.info(`App "${appName}" already exists on Fly.io`);
      consola.info('If you want to recreate the app, please remove it from Fly.io first.');
      process.exit(1);
    } catch {
      // App doesn't exist on Fly.io, so we can proceed
      consola.info(`Found existing fly.toml file but app doesn't exist on Fly.io - proceeding with launch`);
    }
  }
  
  // Generate Dockerfile
  if (!fileExists(join(nuxflyDir, 'Dockerfile'))) {
    const dockerfileContent = generateDockerfile({
      nodeVersion: config.nodeVersion,
    });
    await writeFile(join(nuxflyDir, 'Dockerfile'), dockerfileContent);
  }

  // Determine app name based on environment if not explicitly provided
  let appName = args.name;
  if (!appName) {
    const env = process.env.NUXFLY_ENV;
    if (env && env !== 'prod') {
      // Load base config to get the base app name
      const baseConfig = await loadConfig();
      const baseAppName = baseConfig.app || 'nuxfly-app';
      appName = `${baseAppName}-${env}`;
      consola.info(`Using environment-specific app name: ${appName}`);
    }
  }
  
  // Prepare launch options
  const launchOptions = {
    name: appName,
    region: args.region,
    noDeploy: args['no-deploy'] !== false, // Default to true (no deploy)
    noObjectStorage: true, // Skip default bucket creation
    config: envFlyToml !== join(process.cwd(), 'fly.toml') ? basename(envFlyToml) : undefined,
    extraArgs: ['--ha=false'], // Will be populated with any additional args
  };
  
  // Add any extra arguments passed after --
  if (args._) {
    const dashIndex = process.argv.indexOf('--');
    if (dashIndex !== -1) {
      launchOptions.extraArgs = process.argv.slice(dashIndex + 1);
    }
  }
  
  consola.debug('Launch options:', launchOptions);
  let newConfig;
  
  try {
    // Generate environment-specific fly.toml first
    newConfig = await loadConfig();
    
    // CRITICAL FIX: Ensure the app name and region are set in the config object
    // These should come from the launch options, not just the fly.toml
    if (appName && !newConfig.app) {
      newConfig.app = appName;
      consola.debug(`Set app name in config: ${appName}`);
    }
    
    if (args.region && !newConfig.region) {
      newConfig.region = args.region;
      consola.debug(`Set region in config: ${args.region}`);
    }
    
    const newFlyTomlContent = generateFlyToml(newConfig);
    await writeFile(envFlyToml, newFlyTomlContent);
    consola.success(`Generated environment-specific fly.toml: ${envFlyToml}`);
    
    // Generate .dockerignore file
    const dockerignoreContent = generateDockerignore();
    await writeFile(join(process.cwd(), '.dockerignore'), dockerignoreContent);
    
    // Run fly launch with the pre-generated config
    consola.info('Running fly launch...');
    consola.debug('Launch command:', `flyctl launch ${launchOptions.name ? `--name ${launchOptions.name}` : ''} ${launchOptions.region ? `--region ${launchOptions.region}` : ''} ${launchOptions.noDeploy ? '--no-deploy' : ''} --no-object-storage ${launchOptions.config ? `--config ${launchOptions.config}` : ''} --yes --ha=false`);
    await flyLaunch(launchOptions, newConfig);
    
    // TODO - add all other generated files here
    consola.info('TODO: Add other generated files here...');

    // Create SQLite volume after successful launch
    const region = args.region || await extractRegionFromFlyToml(envFlyToml) || 'ord';
    const volumeSize = args.size || '1';
    try {
      await createSqliteVolume(region, volumeSize, newConfig);
    } catch (error) {
      throw new NuxflyError(`Failed to create SQLite volume: ${error.message}`, {
        suggestion: `You can create the volume manually with: flyctl volumes create sqlite_data --region ${region} --size ${volumeSize}`,
      });
    }
    
    // Create S3 buckets after successful launch
    try {
      const existingBuckets = await getExistingBuckets(newConfig);
      consola.info('🪣 Creating S3 buckets...');


      // Get organization name for storage commands
      const orgName = await getOrgName(newConfig);
      if (!orgName) {
        consola.warn('Could not determine organization name. Bucket creation may fail.');
        consola.info('You can create buckets manually later during deployment.');
        return;
      }
      consola.debug(`Using organization: ${orgName}`);
      
      // Load Nuxt config to detect bucket requirements
      const nuxflyConfig = newConfig.nuxt?.nuxfly || {};

      // Create litestream bucket
      if (nuxflyConfig.litestream) {
        if (!existingBuckets.includes(`${newConfig.app}-litestream`)) {
          await createLitestreamBucket(orgName, newConfig);
        } else {
          consola.error('Litestream bucket already exists, skipping creation. You will need to set the NUXT_NUXFLY_LITESTREAM_S3_ secrets manually.');
        }
      }
      
      // Create public bucket if configured
      if (nuxflyConfig.publicStorage) {
        if (!existingBuckets.includes(`${newConfig.app}-public`)) {
          await createPublicBucket(orgName, newConfig);
        } else {
          consola.error('Public bucket already exists, skipping creation. You will need to set the NUXT_NUXFLY_PUBLIC_BUCKET_S3_ secrets manually.');
        }
      }
      
      // Create private bucket if configured
      if (nuxflyConfig.privateStorage) {
        if (!existingBuckets.includes(`${newConfig.app}-private`)) {
          await createPrivateBucket(orgName, newConfig);
        } else {
          consola.error('Private bucket already exists, skipping creation. You will need to set the NUXT_NUXFLY_PRIVATE_BUCKET_S3_ secrets manually.');
        }
      }

    } catch (error) {
      throw new NuxflyError(`Failed to create S3 buckets: ${error.message}`, {
        suggestion: 'You can create buckets manually later with: nuxfly buckets create',
        cause: error,
      });
    }
    
    // Display next steps
    displayNextSteps(newConfig || config);
    
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
    // Check if sqlite_data volume already exists
    const { executeFlyctlWithOutput } = await import('../utils/flyctl.mjs');
    const volumeListResult = await executeFlyctlWithOutput('volumes', ['list'], config);
    
    // Parse the output to check for existing sqlite_data volume
    const existingVolumes = volumeListResult.stdout.split('\n');
    const sqliteVolumeExists = existingVolumes.some(line =>
      line.includes('sqlite_data') && line.includes(region)
    );
    
    if (sqliteVolumeExists) {
      consola.info(`SQLite volume 'sqlite_data' already exists in region ${region}`);
      return;
    }
    
    // Create the volume if it doesn't exist
    const volumeArgs = ['sqlite_data', '--region', region, '--size', size];
    await executeFlyctl('volumes', ['create', ...volumeArgs], config);
    consola.success(`SQLite volume created successfully in ${region}`);
  } catch (error) {
    // Fail the entire launch if volume creation fails
    throw new NuxflyError(`Failed to create SQLite volume: ${error.message}`, {
      suggestion: `You can create the volume manually later with: flyctl volumes create sqlite_data --region ${region} --size ${size}`,
      cause: error,
    });
  }
}

/**
 * Display helpful next steps after successful launch
 */
function displayNextSteps(config) {
  consola.box({
    title: '🎉 App created successfully!',
    message: `Your app "${config.app}" has been created on Fly.io but is not yet deployed.

Next steps:
  1. Edit your nuxt.config.js nuxfly section to configure additional buckets if needed
  2. Inspect everything in .nuxfly/ and set additional environment variables (optional): nuxfly secrets set KEY=value
  3. Deploy your app: nuxfly deploy

If you're using version control, it is safe to commit your fly.toml file and the contents of ./nuxfly.`,
    style: {
      borderColor: 'green',
      padding: 1,
    },
  });
}
