import consola from 'consola';
import { saveAppConfig } from '../utils/flyctl.mjs';
import { ensureNuxflyDir } from '../utils/filesystem.mjs';
import { validateAppAccess } from '../utils/validation.mjs';
import { withErrorHandling, NuxflyError } from '../utils/errors.mjs';
import { getAppName, getFlyTomlPath, getEnvironmentSpecificFlyTomlPath } from '../utils/config.mjs';

/**
 * Import command - runs fly config save to restore environment-specific fly.toml
 */
export const importConfig = withErrorHandling(async (args, config) => {
  consola.info('📥 Importing existing Fly.io app configuration...');
  
  // Get app name from args or config
  const appName = args.app || getAppName(config);
  
  if (!appName) {
    throw new NuxflyError('No app name specified', {
      suggestion: 'Use --app flag or set app name in your nuxfly config',
    });
  }
  
  // Validate app access
  await validateAppAccess(appName, config);
  
  // Ensure .nuxfly directory exists
  await ensureNuxflyDir(config);
  
  // Get output path for environment-specific fly.toml
  const flyTomlPath = getEnvironmentSpecificFlyTomlPath() || getFlyTomlPath(config);
  
  try {
    consola.info(`Importing configuration for app: ${appName}`);
    
    // Save app config to environment-specific fly.toml
    await saveAppConfig(appName, flyTomlPath, config);
    
    consola.success(`Successfully imported configuration to ${flyTomlPath}`);
    
    // Display next steps
    displayNextSteps(appName);
    
  } catch (error) {
    throw new NuxflyError(`Failed to import app configuration: ${error.message}`, {
      suggestion: 'Make sure the app exists and you have access to it',
      cause: error,
    });
  }
});

/**
 * Display helpful next steps after successful import
 */
function displayNextSteps(appName) {
  consola.box({
    title: '✅ Configuration imported successfully!',
    message: `App "${appName}" configuration has been imported.

Next steps:
  1. Review the configuration: cat ${flyTomlPath}
  2. Update your nuxt.config.js nuxfly section if needed
  3. Deploy your app: nuxfly deploy

Your fly.toml is now available at ${flyTomlPath}`,
    style: {
      borderColor: 'blue',
      padding: 1,
    },
  });
}