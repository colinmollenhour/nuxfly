/**
 * Custom error class for nuxfly-specific errors
 */
export class NuxflyError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'NuxflyError';
    this.exitCode = options.exitCode || 1;
    this.suggestion = options.suggestion;
    this.cause = options.cause;
  }
}

/**
 * Error for when flyctl is not installed
 */
export class FlyctlNotFoundError extends NuxflyError {
  constructor() {
    super('flyctl not found in PATH', {
      suggestion: 'Install flyctl from https://fly.io/docs/flyctl/install/',
      exitCode: 127,
    });
  }
}

/**
 * Error for when .nuxfly/fly.toml is missing
 */
export class FlyTomlNotFoundError extends NuxflyError {
  constructor() {
    super('No .nuxfly/fly.toml found', {
      suggestion: "Run 'nuxfly launch' to create a new app or 'nuxfly import' to import an existing app",
      exitCode: 2,
    });
  }
}

/**
 * Error for invalid configuration
 */
export class ConfigError extends NuxflyError {
  constructor(message, details = null) {
    super(`Configuration error: ${message}`, {
      suggestion: details ? `Check your configuration: ${details}` : 'Check your nuxt.config.js nuxfly section',
      exitCode: 3,
    });
  }
}

/**
 * Error for when Nuxt project is not detected
 */
export class NotNuxtProjectError extends NuxflyError {
  constructor() {
    super('Not a Nuxt project', {
      suggestion: 'Make sure you are in a directory with a nuxt.config.js/ts file',
      exitCode: 4,
    });
  }
}

/**
 * Error for permission issues
 */
export class PermissionError extends NuxflyError {
  constructor(path) {
    super(`Permission denied accessing ${path}`, {
      suggestion: 'Check file and directory permissions',
      exitCode: 13,
    });
  }
}

/**
 * Error for flyctl command failures
 */
export class FlyctlError extends NuxflyError {
  constructor(command, exitCode, stderr) {
    super(`flyctl ${command} failed with exit code ${exitCode}`, {
      suggestion: stderr ? `flyctl error: ${stderr}` : 'Check flyctl command output above',
      exitCode: exitCode,
    });
  }
}

/**
 * Helper function to wrap async functions with error handling
 */
export function withErrorHandling(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof NuxflyError) {
        throw error;
      }
      
      // Handle common system errors
      if (error.code === 'ENOENT') {
        throw new NuxflyError(`File or directory not found: ${error.path}`, {
          suggestion: 'Check that the file exists and you have the correct path',
          exitCode: 2,
          cause: error,
        });
      }
      
      if (error.code === 'EACCES') {
        throw new PermissionError(error.path);
      }
      
      // Re-throw as generic NuxflyError
      throw new NuxflyError(`Unexpected error: ${error.message}`, {
        exitCode: 1,
        cause: error,
      });
    }
  };
}

/**
 * Validation helper that throws ConfigError on failure
 */
export function validateRequired(value, name, suggestion = null) {
  if (!value) {
    throw new ConfigError(`${name} is required`, suggestion);
  }
  return value;
}

/**
 * Helper to create error messages with context
 */
export function createErrorContext(operation, details = {}) {
  return {
    operation,
    ...details,
    timestamp: new Date().toISOString(),
  };
}