import consola from 'consola';
import { flyDeploy, checkAppAccess, ensurePublicBucketUrlSecret } from '../utils/flyctl.mjs';
import { validateDeploymentConfig } from '../utils/validation.mjs';
import { withErrorHandling, NuxflyError } from '../utils/errors.mjs';
import { hasDistDir } from '../utils/config.mjs';
import { getOrgName, createLitestreamBucket, createPublicBucket, createPrivateBucket, getExistingBuckets } from '../utils/buckets.mjs';
import { buildApplication } from '../utils/build.mjs';
import { copyDrizzleMigrations } from '../utils/filesystem.mjs';

/**
 * Check and create any missing S3 buckets based on current configuration
 */
async function ensureBucketsExist(config) {
  consola.info('🪣 Checking S3 buckets...');
  
  // Get app name from fly.toml or config
  const appName = config.app;
  
  try {
    // Validate app exists and user has access
    const hasAccess = await checkAppAccess(appName, config);
    if (!hasAccess) {
      consola.debug(`Cannot access app "${appName}", skipping bucket check`);
      return;
    }
    
    // Get organization name for storage commands
    const orgName = await getOrgName(config);
    if (!orgName) {
      consola.debug('Could not determine organization name, skipping bucket check');
      return;
    }
    
    // Load Nuxt config to detect bucket requirements
    const nuxflyConfig = config.nuxt?.nuxfly || {};
    
    // Check which buckets are configured
    const needsPublicBucket = !!nuxflyConfig.publicStorage;
    const needsPrivateBucket = !!nuxflyConfig.privateStorage;
    const needsLitestreamBucket = !!nuxflyConfig.litestream;

    if (!needsPublicBucket && !needsPrivateBucket && !needsLitestreamBucket) {
      consola.debug('No bucket configurations found');
      return;
    }
    
    // Check existing buckets to avoid duplicates
    const existingBuckets = await getExistingBuckets(config);
    
    let bucketsCreated = 0;
    
    // Create litestream bucket if needed and doesn't exist
    if (needsLitestreamBucket) {
      const litestreamBucketName = `${appName}-litestream`;
      if (existingBuckets.includes(litestreamBucketName)) {
        consola.debug(`Litestream bucket already exists: ${litestreamBucketName}`);
      } else {
        consola.info(`Creating missing litestream bucket: ${litestreamBucketName}`);
        await createLitestreamBucket(orgName, config);
        bucketsCreated++;
      }
    }
    
    // Create public bucket if needed and doesn't exist
    if (needsPublicBucket) {
      const publicBucketName = `${appName}-public`;
      if (existingBuckets.includes(publicBucketName)) {
        consola.debug(`Public bucket already exists: ${publicBucketName}`);
      } else {
        consola.info(`Creating missing public bucket: ${publicBucketName}`);
        await createPublicBucket(orgName, config);
        bucketsCreated++;
      }
    }
    
    // Create private bucket if needed and doesn't exist
    if (needsPrivateBucket) {
      const privateBucketName = `${appName}-private`;
      if (existingBuckets.includes(privateBucketName)) {
        consola.debug(`Private bucket already exists: ${privateBucketName}`);
      } else {
        consola.info(`Creating missing private bucket: ${privateBucketName}`);
        await createPrivateBucket(orgName, config);
        bucketsCreated++;
      }
    }
    
    if (bucketsCreated > 0) {
      consola.success(`Created ${bucketsCreated} missing bucket(s)`);
    } else {
      consola.debug('All configured buckets already exist');
    }
    
  } catch (error) {
    // Don't fail deployment if bucket check fails
    consola.warn(`Failed to check/create buckets: ${error.message}`);
    consola.debug('Continuing with deployment...');
  }
}

/**
 * Deploy command - generates files and deploys to Fly.io
 */
export const deploy = withErrorHandling(async (args, config) => {
  consola.info(`🚀 Deploying ${config.app} to Fly.io...`);
  
  // Validate deployment configuration
  await validateDeploymentConfig(config);
  
  // Validate Nuxt project structure
  if (!hasDistDir(config) && !args.build) {
    consola.error('❌ No .output directory found! Please build your Nuxt application first.');
    process.exit(1);
  }

  try {
    // Copy drizzle migrations from parent project when building
    if (args.build) {
      await copyDrizzleMigrations(config);
    }

    // Build the application first (unless --no-build is specified) to ensure .output is up to date
    await buildApplication({ skipBuild: !args.build });
    
    // Check and create any missing buckets before deployment
    await ensureBucketsExist(config);
    
    // Set public bucket URL secret if needed
    try {
      await ensurePublicBucketUrlSecret(config);
    } catch (error) {
      consola.warn(`Failed to set public bucket URL secret: ${error.message}`);
      consola.debug('Continuing with deployment...');
    }
    
    // Prepare deploy options
    const deployOptions = {
      strategy: args.strategy,
      cwd: process.cwd(), // Deploy from project root instead of .nuxfly
      extraArgs: ['--ha=false'], // Will be populated with any additional args
    };
    
    // Add any extra arguments passed after --
    if (args._) {
      const dashIndex = process.argv.indexOf('--');
      if (dashIndex !== -1) {
        deployOptions.extraArgs = process.argv.slice(dashIndex + 1);
      }
    }
    
    consola.debug('Deploy options:', deployOptions);
    
    // Deploy the application
    await flyDeploy(deployOptions, config);
    
    consola.success('🎉 Deployment completed successfully!');
    
    // Display success message with app info
    displayDeploymentSuccess(config);
    
  } catch (error) {
    if (error.exitCode === 130) {
      // User cancelled (Ctrl+C)
      consola.info('Deployment cancelled by user');
      return;
    }
    
    throw new NuxflyError(`Deployment failed: ${error.message}`, {
      suggestion: 'Check the deployment output above for details',
      cause: error,
    });
  }
});

/**
 * Display deployment success message
 */
function displayDeploymentSuccess(config) {
  const appName = config.app || process.env.FLY_APP;
  const appUrl = appName ? `https://${appName}.fly.dev` : 'your app URL';
  
  consola.box({
    title: '🎉 Deployment successful!',
    message: `Your Nuxt app has been deployed to Fly.io!

🌐 App URL: ${appUrl}
📊 Monitor: https://fly.io/apps/${appName || 'your-app'}

Useful commands:
  • nuxfly status - Check app status
  • nuxfly logs - View app logs  
  • nuxfly open - Open app in browser
  • nuxfly ssh - SSH into app machine`,
    style: {
      borderColor: 'green',
      padding: 1,
    },
  });
}