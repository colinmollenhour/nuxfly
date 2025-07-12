#!/usr/bin/env node

import { defineCommand, runMain } from 'citty';
import consola from 'consola';
import { loadConfig } from './utils/config.mjs';
import { NuxflyError } from './utils/errors.mjs';

// Import command handlers
import { launch } from './commands/launch.mjs';
import { importConfig } from './commands/import.mjs';
import { generate } from './commands/generate.mjs';
import { deploy } from './commands/deploy.mjs';
import { studio } from './commands/studio.mjs';
import { update } from './commands/update.mjs';
import { proxy, shouldProxy } from './commands/proxy.mjs';

// Global configuration
let globalConfig = null;

// Helper function to load config with error handling
async function ensureConfig() {
  if (!globalConfig) {
    try {
      globalConfig = await loadConfig();
    } catch (error) {
      throw new NuxflyError(`Failed to load configuration: ${error.message}`);
    }
  }
  return globalConfig;
}

// Define main command
const main = defineCommand({
  meta: {
    name: 'nuxfly',
    version: '1.0.0',
    description: 'A CLI tool for deploying Nuxt apps to Fly.io',
  },
  args: {
    verbose: {
      type: 'boolean',
      description: 'Enable verbose logging',
      alias: 'v',
    },
    config: {
      type: 'string',
      description: 'Path to fly.toml config file',
    },
    app: {
      type: 'string',
      description: 'Fly app name',
      alias: 'a',
    },
  },
  subCommands: {
    launch: defineCommand({
      meta: {
        name: 'launch',
        description: 'Launch a new Fly app and save config to .nuxfly/fly.toml',
      },
      args: {
        name: {
          type: 'string',
          description: 'App name',
        },
        region: {
          type: 'string',
          description: 'Region to deploy to',
        },
        'deploy': {
          type: 'boolean',
          description: 'Skip deployment after launch',
          default: true,
        },
        size: {
          type: 'string',
          description: 'Size in GB for SQLite volume (default: 1)',
          default: '1',
        },
      },
      async run({ args }) {
        const config = await ensureConfig();
        await launch(args, config);
      },
    }),

    import: defineCommand({
      meta: {
        name: 'import',
        description: 'Import existing Fly app config to .nuxfly/fly.toml',
      },
      args: {
        app: {
          type: 'string',
          description: 'App name to import',
        },
      },
      async run({ args }) {
        const config = await ensureConfig();
        await importConfig(args, config);
      },
    }),

    generate: defineCommand({
      meta: {
        name: 'generate',
        description: 'Generate Fly deployment files in .nuxfly directory',
      },
      args: {
        'build': {
          type: 'boolean',
          description: 'Build the application before generating files',
          default: false,
        },
      },
      async run({ args }) {
        const config = await ensureConfig();
        await generate(args, config);
      },
    }),

    deploy: defineCommand({
      meta: {
        name: 'deploy',
        description: 'Generate files and deploy to Fly.io',
      },
      args: {
        strategy: {
          type: 'string',
          description: 'Deployment strategy',
        },
        'build': {
          type: 'boolean',
          description: 'Build the application before deploying',
          default: false,
        },
      },
      async run({ args }) {
        const config = await ensureConfig();
        await deploy(args, config);
      },
    }),

    studio: defineCommand({
      meta: {
        name: 'studio',
        description: 'Open Drizzle Studio with secure tunnel',
      },
      args: {
        port: {
          type: 'string',
          description: 'Local port for studio',
          default: '4983',
        },
        'remote-port': {
          type: 'string',
          description: 'Remote tunnel port',
          default: '5432',
        },
      },
      async run({ args }) {
        const config = await ensureConfig();
        await studio(args, config);
      },
    }),

    update: defineCommand({
      meta: {
        name: 'update',
        description: 'Update S3 buckets based on current configuration',
      },
      args: {
        app: {
          type: 'string',
          description: 'App name to update buckets for',
        },
      },
      async run({ args }) {
        const config = await ensureConfig();
        await update(args, config);
      },
    }),
  },
  async run({ args }) {
    // Set up logging level
    if (args.verbose) {
      consola.level = 4; // Debug level
    }

    // If no arguments provided, show help
    consola.log('Use --help to see available commands');
  },
});

// Handle unknown commands before running citty
async function handleUnknownCommand() {
  const args = process.argv.slice(2);
  if (args.length === 0) return false;
  
  const command = args[0];
  
  // If it's a help flag, let citty handle it
  if (command === '--help' || command === '-h' || command === '--version' || command === '-v') {
    return false;
  }
  
  // If it's a known command, let citty handle it
  if (!shouldProxy(command)) {
    return false;
  }
  
  // Handle unknown command by proxying to flyctl
  try {
    // Try to load config, but don't fail if not in a Nuxt project
    let config = {};
    try {
      config = await loadConfig();
    } catch (error) {
      // Some flyctl commands don't require Nuxt project (like apps, auth, etc.)
      consola.debug('Could not load config, proceeding without:', error.message);
      config = { _runtime: {} };
    }
    
    // Parse the arguments manually for proxy
    const parsedArgs = { _: args.slice(1) };
    
    // Simple argument parsing for flags
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('--')) {
        const key = arg.slice(2);
        const nextArg = args[i + 1];
        if (nextArg && !nextArg.startsWith('-')) {
          parsedArgs[key] = nextArg;
          i++; // Skip next arg as it's the value
        } else {
          parsedArgs[key] = true;
        }
      } else if (arg.startsWith('-') && arg.length === 2) {
        const key = arg.slice(1);
        const nextArg = args[i + 1];
        if (nextArg && !nextArg.startsWith('-')) {
          parsedArgs[key] = nextArg;
          i++; // Skip next arg as it's the value
        } else {
          parsedArgs[key] = true;
        }
      }
    }
    
    await proxy(parsedArgs, config, command);
    return true;
  } catch (error) {
    if (error instanceof NuxflyError) {
      consola.error(error.message);
      if (error.suggestion) {
        consola.info(`💡 ${error.suggestion}`);
      }
    } else {
      consola.error('An unexpected error occurred:', error.message);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
    }
    process.exit(error.exitCode || 1);
  }
}

// Check for unknown commands first
handleUnknownCommand().then((handled) => {
  if (handled) return;
  
  // Run the normal CLI if no unknown command was handled
  runMain(main).catch((error) => {
    if (error instanceof NuxflyError) {
      consola.error(error.message);
      if (error.suggestion) {
        consola.info(`💡 ${error.suggestion}`);
      }
    } else {
      consola.error('An unexpected error occurred:', error.message);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
    }
    process.exit(error.exitCode || 1);
  });
});