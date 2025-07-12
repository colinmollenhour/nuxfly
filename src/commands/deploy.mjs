import consola from 'consola';
import { flyDeploy } from '../utils/flyctl.mjs';
import { validateDeploymentConfig } from '../utils/validation.mjs';
import { withErrorHandling, NuxflyError } from '../utils/errors.mjs';
import { getNuxflyDir } from '../utils/config.mjs';
import { buildApplication } from '../utils/build.mjs';
import { generate } from './generate.mjs';

/**
 * Deploy command - generates files and deploys to Fly.io
 */
export const deploy = withErrorHandling(async (args, config) => {
  consola.info('🚀 Deploying to Fly.io...');
  
  // Validate deployment configuration
  await validateDeploymentConfig(config);
  
  try {
    // First, build the application to ensure dist is up to date
    consola.info('Step 1: Building application...');
    await buildApplication({ skipBuild: args.noBuild });
    
    // Then, generate all deployment files
    consola.info('Step 2: Generating deployment files...');
    await generate(args, config);
    
    // Get .nuxfly directory
    const nuxflyDir = getNuxflyDir(config);
    
    // Prepare deploy options
    const deployOptions = {
      strategy: args.strategy,
      cwd: nuxflyDir, // Deploy from .nuxfly directory
      extraArgs: [], // Will be populated with any additional args
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
    consola.info('Step 3: Deploying application...');
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