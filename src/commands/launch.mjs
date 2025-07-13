import { join } from 'path';
import { readFile } from 'fs/promises';
import consola from 'consola';
import { flyLaunch, executeFlyctl } from '../utils/flyctl.mjs';
import { ensureNuxflyDir, copyFile, fileExists } from '../utils/filesystem.mjs';
import { validateLaunchCommand } from '../utils/validation.mjs';
import { withErrorHandling, NuxflyError } from '../utils/errors.mjs';
import { createS3Buckets } from '../utils/buckets.mjs';

/**
 * Launch command - runs fly launch and saves config to .nuxfly/fly.toml
 */
export const launch = withErrorHandling(async (args, config) => {
  consola.info('🚀 Launching new Fly.io app...');
  
  // Validate command requirements
  await validateLaunchCommand(args);
  
  // Ensure .nuxfly directory exists
  const nuxflyDir = await ensureNuxflyDir(config);
  
  // Check if fly.toml already exists in .nuxfly directory
  const nuxflyFlyToml = join(nuxflyDir, 'fly.toml');
  if (fileExists(nuxflyFlyToml)) {
    consola.error('❌ App already exists!');
    consola.info(`Found existing fly.toml at: ${nuxflyFlyToml}`);
    consola.info('If you want to recreate the app, please remove the existing .nuxfly/fly.toml file first.');
    process.exit(1);
  }
  
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
    
    // Check if fly.toml was created in root
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
      try {
        await createS3Buckets(args.name || 'your-app', config);
      } catch (error) {
        throw new NuxflyError(`Failed to create S3 buckets: ${error.message}`, {
          suggestion: 'You can create buckets manually later with: nuxfly buckets create',
          cause: error,
        });
      }
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
function displayNextSteps(appName) {
  consola.box({
    title: '🎉 App created successfully!',
    message: `Your app "${appName}" has been created on Fly.io but is not yet deployed.

Next steps:
  1. Configure your app: Edit your nuxt.config.js nuxfly section to configure additional buckets if needed
  2. Generate deployment files: nuxfly generate
  3. Inspect everything and set additional environment variables (optional): nuxfly secrets set KEY=value
  4. Deploy your app: nuxfly deploy

Your fly.toml is saved in .nuxfly/fly.toml for version control.
Storage buckets have been created based on your current configuration.`,
    style: {
      borderColor: 'green',
      padding: 1,
    },
  });
}
