import { accessSync, existsSync, constants } from 'fs';
import consola from 'consola';
import { FlyTomlNotFoundError, NotNuxtProjectError, NuxflyError, withErrorHandling } from './errors.mjs';
import { checkAppAccess, checkFlyAuth } from './flyctl.mjs';
import { getFlyTomlPath, getAppName } from './config.mjs';

/**
 * Validate that .nuxfly/fly.toml exists
 */
export const validateFlyTomlExists = withErrorHandling((config) => {
  const flyTomlPath = getFlyTomlPath(config);
  
  if (!existsSync(flyTomlPath)) {
    throw new FlyTomlNotFoundError();
  }
  
  consola.debug(`Found fly.toml at: ${flyTomlPath}`);
  return true;
});

/**
 * Validate that this is a Nuxt project
 */
export const validateNuxtProject = withErrorHandling((cwd = process.cwd()) => {
  const nuxtConfigFiles = [
    'nuxt.config.js',
    'nuxt.config.ts',
    'nuxt.config.mjs',
    'nuxt.config.cjs',
  ];
  
  const hasNuxtConfig = nuxtConfigFiles.some(filename => 
    existsSync(`${cwd}/${filename}`)
  );
  
  if (!hasNuxtConfig) {
    throw new NotNuxtProjectError();
  }
  
  consola.debug('Validated Nuxt project');
  return true;
});

/**
 * Validate user has access to the specified fly app
 */
export const validateAppAccess = withErrorHandling(async (appName, config = {}) => {
  if (!appName) {
    throw new NuxflyError('No app name specified', {
      suggestion: 'Set app name in your nuxfly config or use --app flag',
    });
  }
  
  // Check if user is authenticated
  const user = await checkFlyAuth();
  if (!user) {
    throw new NuxflyError('Not authenticated with Fly.io', {
      suggestion: 'Run "flyctl auth login" to authenticate',
    });
  }
  
  // Check if user has access to the app
  const hasAccess = await checkAppAccess(appName, config);
  if (!hasAccess) {
    throw new NuxflyError(`No access to app "${appName}"`, {
      suggestion: 'Check that the app exists and you have permission to access it',
    });
  }
  
  consola.debug(`Validated access to app: ${appName}`);
  return true;
});

/**
 * Validate required configuration for deployment
 */
export const validateDeploymentConfig = withErrorHandling(async (config) => {
  // Check for fly.toml
  validateFlyTomlExists(config);
  
  // Check app access if app is configured
  const appName = getAppName(config);
  if (appName) {
    await validateAppAccess(appName, config);
  }
  
  return true;
});

/**
 * Validate command-specific requirements
 */
export const validateCommand = withErrorHandling(async (command, config, args = {}) => {
  switch (command) {
    case 'launch':
      // Launch can be run without existing fly.toml
      validateNuxtProject();
      break;
      
    case 'import': {
      // Import requires app name but not existing fly.toml
      validateNuxtProject();
      const importAppName = args.app || getAppName(config);
      if (importAppName) {
        await validateAppAccess(importAppName, config);
      }
      break;
    }
      
    case 'generate':
      // Generate requires existing fly.toml
      validateNuxtProject();
      validateFlyTomlExists(config);
      break;
      
    case 'deploy':
      // Deploy requires full deployment config
      validateNuxtProject();
      await validateDeploymentConfig(config);
      break;
      
    case 'studio':
      // Studio requires deployed app
      validateNuxtProject();
      await validateDeploymentConfig(config);
      break;
      
    default:
      // Other commands (proxy) require fly.toml
      validateFlyTomlExists(config);
      break;
  }
  
  return true;
});

/**
 * Validate that required dependencies are available
 */
export const validateDependencies = withErrorHandling(async (command) => {
  // flyctl is always required
  const { checkFlyctlAvailable } = await import('./flyctl.mjs');
  await checkFlyctlAvailable();
  
  // Check command-specific dependencies
  if (command === 'studio') {
    await validateDrizzleKit();
  }
  
  return true;
});

/**
 * Validate drizzle-kit is available for studio command
 */
const validateDrizzleKit = withErrorHandling(async () => {
  try {
    const { execa } = await import('execa');
    await execa('drizzle-kit', ['--version'], { stdio: 'pipe' });
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new NuxflyError('drizzle-kit not found', {
        suggestion: 'Install drizzle-kit: npm install -g drizzle-kit',
        exitCode: 127,
      });
    }
    // If drizzle-kit exists but version command fails, still return true
    return true;
  }
});

/**
 * Validate port numbers
 */
export function validatePort(port, name = 'port') {
  const portNum = parseInt(port, 10);
  
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    throw new NuxflyError(`Invalid ${name}: ${port}`, {
      suggestion: `${name} must be a number between 1 and 65535`,
    });
  }
  
  return portNum;
}

/**
 * Validate app name format
 */
export function validateAppName(name) {
  if (!name) {
    throw new NuxflyError('App name is required');
  }
  
  // Fly.io app name requirements
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name) || name.length > 30) {
    throw new NuxflyError(`Invalid app name: ${name}`, {
      suggestion: 'App names must be lowercase, alphanumeric, max 30 chars, and cannot start/end with hyphens',
    });
  }
  
  return name;
}

/**
 * Validate region code
 */
export function validateRegion(region) {
  if (!region) {
    return 'ord'; // Default region
  }
  
  // Basic validation - just check it's a reasonable string
  if (!/^[a-z]{3}$/.test(region)) {
    consola.warn(`Region "${region}" may not be valid. Common regions: ord, dfw, lax, iad, lhr, nrt, syd`);
  }
  
  return region;
}

/**
 * Pre-flight checks before running any command
 */
export const preflightChecks = withErrorHandling(async (command, config, args = {}) => {
  consola.debug(`Running preflight checks for command: ${command}`);
  
  // Validate dependencies
  await validateDependencies(command);
  
  // Validate command requirements
  await validateCommand(command, config, args);
  
  consola.debug('Preflight checks passed');
  return true;
});

/**
 * Validate file permissions
 */
export function validateFilePermissions(filepath) {
  try {
    accessSync(filepath, constants.R_OK | constants.W_OK);
    return true;
  } catch {
    throw new NuxflyError(`No read/write access to ${filepath}`, {
      suggestion: 'Check file permissions',
    });
  }
}

/**
 * Validate directory is writable
 */
export function validateDirectoryWritable(dirpath) {
  try {
    accessSync(dirpath, constants.W_OK);
    return true;
  } catch {
    throw new NuxflyError(`Directory not writable: ${dirpath}`, {
      suggestion: 'Check directory permissions',
    });
  }
}

/**
 * Comprehensive validation for launch command
 */
export const validateLaunchCommand = withErrorHandling(async (args) => {
  validateNuxtProject();
  
  if (args.name) {
    validateAppName(args.name);
  }
  
  if (args.region) {
    validateRegion(args.region);
  }
  
  // Check if user is authenticated
  const user = await checkFlyAuth();
  if (!user) {
    throw new NuxflyError('Not authenticated with Fly.io', {
      suggestion: 'Run "flyctl auth login" to authenticate',
    });
  }
  
  return true;
});