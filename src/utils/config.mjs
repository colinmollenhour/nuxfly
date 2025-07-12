import { loadConfig as loadC12Config } from 'c12';
import { existsSync } from 'fs';
import { join } from 'path';
import consola from 'consola';
import { ConfigError, NotNuxtProjectError, validateRequired } from './errors.mjs';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  app: null,
  region: 'ord',
  memory: '512mb',
  instances: {
    min: 1,
    max: 3,
  },
  env: {
    NODE_ENV: 'production',
  },
  secrets: [],
  volumes: [],
  dockerfile: true,
  build: {
    dockerfile: './Dockerfile',
  },
};

/**
 * Load and merge configuration from multiple sources
 */
export async function loadConfig() {
  const cwd = process.cwd();
  
  // Check if this is a Nuxt project
  if (!isNuxtProject(cwd)) {
    throw new NotNuxtProjectError();
  }

  // Load configuration using c12
  const { config: nuxtConfig } = await loadC12Config({
    name: 'nuxt',
    cwd,
    configFile: ['nuxt.config.js', 'nuxt.config.ts', 'nuxt.config.mjs'],
    defaults: {},
  }).catch((error) => {
    consola.debug('Failed to load nuxt.config:', error.message);
    return { config: {} };
  });

  // Extract nuxfly configuration
  const nuxflyConfig = nuxtConfig?.nuxfly || {};
  
  // Merge with defaults
  const config = mergeConfig(DEFAULT_CONFIG, nuxflyConfig);
  
  // Override with environment variables
  applyEnvironmentOverrides(config);
  
  // Validate configuration
  validateConfig(config);
  
  // Add runtime information
  config._runtime = {
    cwd,
    nuxflyDir: join(cwd, '.nuxfly'),
    flyTomlPath: join(cwd, '.nuxfly', 'fly.toml'),
    flyTomlExists: existsSync(join(cwd, '.nuxfly', 'fly.toml')),
    distPath: join(cwd, '.output'),
  };
  
  consola.debug('Loaded configuration:', config);
  
  return config;
}

/**
 * Check if current directory is a Nuxt project
 */
function isNuxtProject(cwd) {
  const nuxtConfigFiles = [
    'nuxt.config.js',
    'nuxt.config.ts',
    'nuxt.config.mjs',
    'nuxt.config.cjs',
  ];
  
  return nuxtConfigFiles.some(filename => existsSync(join(cwd, filename)));
}

/**
 * Deep merge configuration objects
 */
function mergeConfig(defaults, userConfig) {
  const result = { ...defaults };
  
  for (const [key, value] of Object.entries(userConfig)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = mergeConfig(result[key] || {}, value);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Apply environment variable overrides
 */
function applyEnvironmentOverrides(config) {
  // FLY_APP environment variable
  if (process.env.FLY_APP) {
    config.app = process.env.FLY_APP;
    consola.debug('Using FLY_APP from environment:', config.app);
  }
  
  // FLY_ACCESS_TOKEN is handled by flyctl directly
  if (process.env.FLY_ACCESS_TOKEN) {
    consola.debug('FLY_ACCESS_TOKEN found in environment');
  }
  
  // Other environment overrides
  if (process.env.FLY_REGION) {
    config.region = process.env.FLY_REGION;
  }
  
  if (process.env.FLY_MEMORY) {
    config.memory = process.env.FLY_MEMORY;
  }
}

/**
 * Validate configuration against schema
 */
function validateConfig(config) {
  try {
    // Validate instances
    if (config.instances) {
      if (typeof config.instances.min === 'number' && config.instances.min < 0) {
        throw new ConfigError('instances.min must be >= 0');
      }
      if (typeof config.instances.max === 'number' && config.instances.max < 1) {
        throw new ConfigError('instances.max must be >= 1');
      }
      if (config.instances.min > config.instances.max) {
        throw new ConfigError('instances.min cannot be greater than instances.max');
      }
    }
    
    // Validate memory format
    if (config.memory && !isValidMemoryFormat(config.memory)) {
      throw new ConfigError('memory must be in format like "512mb", "1gb", etc.');
    }
    
    // Validate volumes
    if (config.volumes && Array.isArray(config.volumes)) {
      for (const volume of config.volumes) {
        validateRequired(volume.name, 'volume.name');
        validateRequired(volume.mount, 'volume.mount');
        validateRequired(volume.size, 'volume.size');
        
        if (!volume.mount.startsWith('/')) {
          throw new ConfigError('volume.mount must be an absolute path');
        }
        
        if (!isValidMemoryFormat(volume.size)) {
          throw new ConfigError('volume.size must be in format like "1gb", "500mb", etc.');
        }
      }
    }
    
    // Validate secrets array
    if (config.secrets && !Array.isArray(config.secrets)) {
      throw new ConfigError('secrets must be an array of strings');
    }
    
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }
    throw new ConfigError(`Invalid configuration: ${error.message}`);
  }
}

/**
 * Check if memory format is valid (e.g., "512mb", "1gb")
 */
function isValidMemoryFormat(memory) {
  return /^\d+(?:mb|gb)$/i.test(memory);
}

/**
 * Get app name from configuration or environment
 */
export function getAppName(config) {
  return config.app || process.env.FLY_APP;
}

/**
 * Get region from configuration
 */
export function getRegion(config) {
  return config.region || 'ord';
}

/**
 * Check if fly.toml exists
 */
export function hasFlyToml(config) {
  return config._runtime?.flyTomlExists || false;
}

/**
 * Get the .nuxfly directory path
 */
export function getNuxflyDir(config) {
  return config._runtime?.nuxflyDir || join(process.cwd(), '.nuxfly');
}

/**
 * Get the fly.toml path
 */
export function getFlyTomlPath(config) {
  return config._runtime?.flyTomlPath || join(process.cwd(), '.nuxfly', 'fly.toml');
}

/**
 * Check if dist directory exists (checks filesystem on-demand)
 */
export function hasDistDir(config) {
  const distPath = getDistPath(config);
  return existsSync(distPath);
}

/**
 * Get dist directory path
 */
export function getDistPath(config) {
  return config._runtime?.distPath || join(process.cwd(), '.output');
}