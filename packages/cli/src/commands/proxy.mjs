import consola from 'consola';
import { executeFlyctl } from '../utils/flyctl.mjs';
import { withErrorHandling, NuxflyError } from '../utils/errors.mjs';
import { validateFlyTomlExists } from '../utils/validation.mjs';

/**
 * Proxy command - forwards unknown commands to flyctl with proper configuration
 */
export const proxy = withErrorHandling(async (args, config, originalCommand) => {
  // If we have a fly.toml, validate it exists and use it
  if (config._runtime?.flyTomlExists) {
    validateFlyTomlExists(config);
  }
  
  // Get the original command and arguments
  const command = originalCommand || args._[0];
  const commandArgs = args._ ? args._.slice(1) : [];
  
  if (!command) {
    throw new NuxflyError('No command specified for proxy');
  }
  
  // Convert parsed args back to command line format
  const userArgs = [...commandArgs];
  
  // Add flags from parsed args
  Object.entries(args).forEach(([key, value]) => {
    if (key === '_' || key === '$0') return;
    
    if (typeof value === 'boolean' && value) {
      userArgs.push(`--${key}`);
    } else if (value !== undefined && value !== null) {
      userArgs.push(`--${key}`, String(value));
    }
  });
  
  consola.debug(`Proxying command: ${command} with args:`, userArgs);
  
  // Execute the command through flyctl with proper config flags
  await executeFlyctl(command, userArgs, config, {
    stdio: 'inherit',
  });
});

/**
 * Check if a command should be proxied to flyctl
 */
export function shouldProxy(command) {
  // List of commands that nuxfly handles directly
  const nuxflyCommands = [
    'launch',
    'import',
    'generate',
    'deploy',
    'studio',
    'help',
    '--help',
    '-h',
    '--version',
    '-v',
  ];
  
  return !nuxflyCommands.includes(command);
}

/**
 * Get flyctl command suggestions for unknown commands
 */
export function getFlyctlSuggestions(command) {
  const commonFlyctlCommands = [
    'apps',
    'status',
    'logs',
    'open',
    'ssh',
    'scale',
    'secrets',
    'volumes',
    'releases',
    'machines',
    'config',
    'destroy',
    'suspend',
    'resume',
    'restart',
    'clone',
    'history',
    'dashboard',
    'docs',
  ];
  
  // Simple string similarity check
  const suggestions = commonFlyctlCommands.filter(cmd => 
    cmd.includes(command) || command.includes(cmd) || 
    levenshteinDistance(command, cmd) <= 2
  );
  
  return suggestions.slice(0, 3); // Return top 3 suggestions
}

/**
 * Simple Levenshtein distance for command suggestions
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}