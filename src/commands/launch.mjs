import { join } from 'path';
import consola from 'consola';
import { flyLaunch } from '../utils/flyctl.mjs';
import { ensureNuxflyDir, copyFile } from '../utils/filesystem.mjs';
import { validateLaunchCommand } from '../utils/validation.mjs';
import { withErrorHandling, NuxflyError } from '../utils/errors.mjs';

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