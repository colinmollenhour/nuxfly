import { execa } from 'execa';
import consola from 'consola';
import { FlyctlNotFoundError, FlyctlError, withErrorHandling } from './errors.mjs';
import { getFlyTomlPath, getAppName } from './config.mjs';

/**
 * Check if flyctl is available in PATH
 */
export const checkFlyctlAvailable = withErrorHandling(async () => {
  try {
    await execa('flyctl', ['version'], { stdio: 'pipe' });
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new FlyctlNotFoundError();
    }
    // If flyctl exists but version command fails, still return true
    // as the command might work in other contexts
    return true;
  }
});

/**
 * Build flyctl command arguments with proper config and app flags
 */
export function buildFlyctlArgs(command, userArgs = [], config = {}) {
  const args = [command];
  
  // Always add dockerfile and dockerignore flags for deployment commands
  if (['launch'].includes(command)) {
    args.push('--dockerfile', '.nuxfly/Dockerfile');
    args.push('--dockerignore-from-gitignore'); // Suppress option as we will overwrite it anyway
  }
  
  // Add config flag if fly.toml exists in root
  // Skip for storage commands and launch (since launch creates new configs)
  if (command !== 'storage' && command !== 'launch' && config._runtime?.flyTomlExists) {
    const flyTomlPath = getFlyTomlPath(config);
    args.push('--config', flyTomlPath);
    consola.debug(`Using config: ${flyTomlPath}`);
  }
  
  // Add app flag if configured (but not for launch or storage commands)
  const appName = getAppName(config);
  if (command !== 'storage' && command !== 'launch' && appName) {
    args.push('--app', appName);
    consola.debug(`Using app: ${appName}`);
  }
  
  // Add user arguments
  args.push(...userArgs);
  
  return args;
}

/**
 * Execute flyctl command with proper setup and error handling
 */
export const executeFlyctl = withErrorHandling(async (command, userArgs = [], config = {}, options = {}) => {
  // Check if flyctl is available
  await checkFlyctlAvailable();
  
  // Build command arguments
  const args = buildFlyctlArgs(command, userArgs, config);
  
  // Prepare execution options
  const execOptions = {
    stdio: options.stdio || 'inherit',
    cwd: options.cwd || process.cwd(),
    env: {
      ...process.env,
      ...options.env,
    },
    ...options.execaOptions,
  };
  
  // Ensure environment variables are passed through
  if (process.env.FLY_ACCESS_TOKEN) {
    execOptions.env.FLY_ACCESS_TOKEN = process.env.FLY_ACCESS_TOKEN;
  } else if (process.env.FLY_API_TOKEN) {
    execOptions.env.FLY_API_TOKEN = process.env.FLY_API_TOKEN;
  }
  
  consola.debug(`Executing: flyctl ${args.join(' ')}`);
  
  try {
    const result = await execa('flyctl', args, execOptions);
    return result;
  } catch (error) {
    // Handle flyctl-specific errors
    if (error.exitCode) {
      throw new FlyctlError(command, error.exitCode, error.stderr);
    }
    
    // Handle system-level errors
    if (error.code === 'ENOENT') {
      throw new FlyctlNotFoundError();
    }
    
    throw new FlyctlError(command, 1, error.message);
  }
});

/**
 * Execute flyctl command and capture output
 */
export const executeFlyctlWithOutput = withErrorHandling(async (command, userArgs = [], config = {}) => {
  const result = await executeFlyctl(command, userArgs, config, {
    stdio: 'pipe',
  });
  
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
});

/**
 * Execute flyctl command with output in a specific directory
 */
export const executeFlyctlWithOutputInDir = withErrorHandling(async (command, userArgs = [], config = {}, directory) => {
  consola.debug(`Executing flyctl with output in directory: ${directory}`);
  
  const result = await executeFlyctl(command, userArgs, config, {
    stdio: 'pipe',
    cwd: directory,
  });
  
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
});

/**
 * Execute flyctl command in a specific directory
 */
export const executeFlyctlInDir = withErrorHandling(async (command, userArgs = [], config = {}, directory) => {
  consola.debug(`Executing flyctl in directory: ${directory}`);
  
  return executeFlyctl(command, userArgs, config, {
    cwd: directory,
  });
});

/**
 * Stream flyctl command output in real-time
 */
export const streamFlyctl = withErrorHandling(async (command, userArgs = [], config = {}, options = {}) => {
  await checkFlyctlAvailable();
  
  const args = buildFlyctlArgs(command, userArgs, config);
  
  const execOptions = {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...options.env,
    },
  };
  
  // Ensure environment variables are passed through
  if (process.env.FLY_ACCESS_TOKEN) {
    execOptions.env.FLY_ACCESS_TOKEN = process.env.FLY_ACCESS_TOKEN;
  } else if (process.env.FLY_API_TOKEN) {
    execOptions.env.FLY_API_TOKEN = process.env.FLY_API_TOKEN;
  }

  consola.debug(`Streaming: flyctl ${args.join(' ')}`);
  
  try {
    const subprocess = execa('flyctl', args, execOptions);
    
    // Handle process signals
    process.on('SIGINT', () => {
      subprocess.kill('SIGINT');
    });
    
    process.on('SIGTERM', () => {
      subprocess.kill('SIGTERM');
    });
    
    const result = await subprocess;
    return result;
  } catch (error) {
    if (error.exitCode) {
      throw new FlyctlError(command, error.exitCode, error.stderr);
    }
    
    if (error.code === 'ENOENT') {
      throw new FlyctlNotFoundError();
    }
    
    throw new FlyctlError(command, 1, error.message);
  }
});

/**
 * Check if user is authenticated with flyctl
 */
export const checkFlyAuth = withErrorHandling(async () => {
  try {
    const result = await executeFlyctlWithOutput('auth', ['whoami']);
    return result.stdout.trim();
  } catch (error) {
    if (error instanceof FlyctlError && error.exitCode === 1) {
      return null; // Not authenticated
    }
    throw error;
  }
});

/**
 * Get list of user's apps
 */
export const getFlyApps = withErrorHandling(async (config = {}) => {
  try {
    const result = await executeFlyctlWithOutput('apps', ['list', '--json'], config);
    return JSON.parse(result.stdout);
  } catch (error) {
    consola.debug('Failed to get apps list:', error.message);
    return [];
  }
});

/**
 * Check if an app exists and user has access
 */
export const checkAppAccess = withErrorHandling(async (appName, config = {}) => {
  try {
    const result = await executeFlyctlWithOutput('status', ['--app', appName], config);
    return result.exitCode === 0;
  } catch {
    return false;
  }
});

/**
 * Parse flyctl JSON output safely
 */
export function parseFlyctlJSON(output) {
  try {
    return JSON.parse(output);
  } catch (parseError) {
    consola.debug('Failed to parse flyctl JSON output:', parseError.message);
    return null;
  }
}

/**
 * Get app info from flyctl
 */
export const getAppInfo = withErrorHandling(async (appName, config = {}) => {
  try {
    const result = await executeFlyctlWithOutput('status', ['--app', appName, '--json'], config);
    return parseFlyctlJSON(result.stdout);
  } catch (error) {
    consola.debug(`Failed to get app info for ${appName}:`, error.message);
    return null;
  }
});

/**
 * Execute flyctl launch with specific options
 */
export const flyLaunch = withErrorHandling(async (options = {}, config = {}) => {
  const args = [];
  
  // Add launch-specific options
  if (options.name) {
    args.push('--name', options.name);
  }
  
  if (options.region) {
    args.push('--region', options.region);
  }
  
  if (options.noDeploy) {
    args.push('--no-deploy');
  }
  
  if (options.noObjectStorage) {
    args.push('--no-object-storage');
  }
  
  if (options.config) {
    args.push('--config', options.config);
  }
  
  // Always add --yes to skip prompts
  args.push('--yes');
  
  // Add any additional arguments
  if (options.extraArgs) {
    args.push(...options.extraArgs);
  }
  
  return streamFlyctl('launch', args, config);
});

/**
 * Execute flyctl deploy with specific options
 */
export const flyDeploy = withErrorHandling(async (options = {}, config = {}) => {
  const args = [];
  
  // Add deploy-specific options
  if (options.strategy) {
    args.push('--strategy', options.strategy);
  }
  
  if (options.buildArg) {
    for (const [key, value] of Object.entries(options.buildArg)) {
      args.push('--build-arg', `${key}=${value}`);
    }
  }
  
  // Add any additional arguments
  if (options.extraArgs) {
    args.push(...options.extraArgs);
  }
  
  return streamFlyctl('deploy', args, config, {
    cwd: options.cwd,
  });
});

/**
 * Save app config to file
 */
export const saveAppConfig = withErrorHandling(async (appName, outputPath, config = {}) => {
  const args = ['--app', appName];
  
  return executeFlyctl('config', ['save', ...args], config, {
    cwd: process.cwd(),
    env: {
      FLY_TOML: outputPath,
    },
  });
});

/**
 * Get app secrets
 */
export const getAppSecrets = withErrorHandling(async (config = {}) => {
  try {
    const result = await executeFlyctlWithOutput('secrets', ['list', '--json'], config);
    return parseFlyctlJSON(result.stdout) || [];
  } catch (error) {
    consola.debug('Failed to get app secrets:', error.message);
    return [];
  }
});

/**
 * Set app secret
 */
export const setAppSecret = withErrorHandling(async (key, value, config = {}) => {
  try {
    const args = ['set', `${key}=${value}`];
    await executeFlyctl('secrets', args, config);
    consola.success(`✅ Set secret: ${key}`);
    return true;
  } catch (error) {
    consola.debug(`Failed to set secret ${key}:`, error.message);
    return false;
  }
});

/**
 * Check if a secret exists
 */
export const checkSecretExists = withErrorHandling(async (key, config = {}) => {
  try {
    const secrets = await getAppSecrets(config);
    return secrets.some(secret => secret.Name === key);
  } catch (error) {
    consola.debug(`Failed to check if secret ${key} exists:`, error.message);
    return false;
  }
});

/**
 * Set public bucket URL secret if publicStorage is enabled and secret doesn't exist
 */
export const ensurePublicBucketUrlSecret = withErrorHandling(async (config) => {
  const nuxflyConfig = config.nuxt?.nuxfly || {};
  
  if (!nuxflyConfig.publicStorage) {
    consola.debug('Public storage not enabled, skipping public bucket URL secret');
    return false;
  }
  
  const secretKey = 'NUXT_PUBLIC_S3_PUBLIC_URL';
  const appName = config.app;
  
  if (!appName) {
    consola.debug('No app name found, cannot set public bucket URL secret');
    return false;
  }
  
  // Check if secret already exists
  const secretExists = await checkSecretExists(secretKey, config);
  if (secretExists) {
    consola.debug(`Secret ${secretKey} already exists, skipping`);
    return false;
  }
  
  // Generate public bucket URL
  const publicBucketUrl = `https://${appName}-public.t3.storageapi.dev`;
  
  consola.info(`🔐 Setting public bucket URL secret: ${secretKey}`);
  const success = await setAppSecret(secretKey, publicBucketUrl, config);
  
  if (success) {
    consola.success(`✅ Set public bucket URL: ${publicBucketUrl}`);
  }
  
  return success;
});