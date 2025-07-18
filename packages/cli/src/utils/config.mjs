import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import consola from 'consola';
import { ConfigError, NotNuxtProjectError, validateRequired } from './errors.mjs';
import { loadNuxtConfig } from '@nuxt/kit';
import { parseFlyToml } from '../templates/fly-toml.mjs';

/**
 * Load and merge configuration from multiple sources
 */
export async function loadConfig() {
  const cwd = process.cwd();
  
  // Check if this is a Nuxt project
  if (!isNuxtProject(cwd)) {
    throw new NotNuxtProjectError();
  }

  // Load configuration using nuxt/kit
  const nuxtConfig = await loadNuxtConfig({
    rootDir: cwd,
    configFile: 'nuxt.config.ts',
    defaults: {},
    env: process.env,
  })

  // Read app name from fly.toml if it exists
  const flyTomlPath = join(cwd, 'fly.toml');
  const flyTomlExists = existsSync(flyTomlPath);
  let flyConfig = {};
  if (flyTomlExists) {
    const flyTomlContent = readFileSync(flyTomlPath, 'utf8');
    flyConfig = parseFlyToml(flyTomlContent);
  }
  const config = {
    nuxt: nuxtConfig,
    app: flyConfig.app,
    region: flyConfig.region,
    memory: flyConfig.memory,
    cpu_kind: flyConfig.cpu_kind,
    cpus: flyConfig.cpus,
    env: flyConfig.env || {},
    volumes: flyConfig.volumes || [],
  }
  // Override with environment variables
  applyEnvironmentOverrides(config);
  
  // Validate configuration
  validateConfig(config);
  
  // Add runtime information
  config._runtime = {
    cwd,
    nuxflyDir: join(cwd, '.nuxfly'),
    flyConfig,
    flyTomlExists,
    distPath: join(cwd, '.output'),
  };
  
  return config;
}

/**
 * Check if current directory is a Nuxt project
 */
function isNuxtProject(cwd) {
  const nuxtConfigFiles = [
    // 'nuxt.config.js',
    'nuxt.config.ts',
    // 'nuxt.config.mjs',
    // 'nuxt.config.cjs',
  ];
  
  return nuxtConfigFiles.some(filename => existsSync(join(cwd, filename)));
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
  return config._runtime?.flyTomlPath || join(process.cwd(), 'fly.toml');
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