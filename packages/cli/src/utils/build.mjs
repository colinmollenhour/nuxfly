import { existsSync } from 'fs';
import { join } from 'path';
import { execa } from 'execa';
import consola from 'consola';
import { NuxflyError } from './errors.mjs';

/**
 * Detect package manager from lock files
 */
export function detectPackageManager() {
  const cwd = process.cwd();
  
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (existsSync(join(cwd, 'yarn.lock'))) {
    return 'yarn';
  }
  if (existsSync(join(cwd, 'bun.lockb'))) {
    return 'bun';
  }
  return 'npm';
}

/**
 * Build the application using the detected package manager
 */
export async function buildApplication(options = {}) {
  const { skipBuild = false } = options;
  
  if (skipBuild) {
    consola.info('⏭️  Skipping build step (--no-build specified)');
    return;
  }
  
  const packageManager = detectPackageManager();
  
  try {
    consola.debug(`Running: ${packageManager} run build`);
    await execa(packageManager, ['run', 'build'], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    consola.success('✅ Application built successfully!');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new NuxflyError(`${packageManager} not found. Please install ${packageManager} or use a different package manager.`, {
        suggestion: getInstallSuggestion(packageManager),
      });
    }
    
    throw new NuxflyError(`Build failed: ${error.message}`, {
      suggestion: 'Check the build output above for details. Make sure your package.json has a "build" script.',
      cause: error,
    });
  }
}

/**
 * Get installation suggestion for package manager
 */
function getInstallSuggestion(packageManager) {
  switch (packageManager) {
    case 'pnpm':
      return 'Install pnpm with: npm install -g pnpm';
    case 'yarn':
      return 'Install yarn with: npm install -g yarn';
    case 'bun':
      return 'Install bun with: curl -fsSL https://bun.sh/install | bash';
    default:
      return 'npm should be available with Node.js installation';
  }
}

/**
 * Install dependencies in the .nuxfly directory
 */
export async function installNuxflyDependencies(nuxflyDir) {
  consola.info('📦 Installing dependencies in .nuxfly directory...');
  
  try {
    consola.debug(`Running: npm install in ${nuxflyDir}`);
    await execa('npm', ['install'], {
      stdio: 'inherit',
      cwd: nuxflyDir,
    });
    consola.success('✅ Dependencies installed successfully in .nuxfly directory!');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new NuxflyError('npm not found. Please install Node.js and npm.', {
        suggestion: 'Install Node.js from https://nodejs.org/',
      });
    }
    
    throw new NuxflyError(`Failed to install dependencies in .nuxfly directory: ${error.message}`, {
      suggestion: 'Check the npm install output above for details. Make sure the package.json in .nuxfly directory is valid.',
      cause: error,
    });
  }
}
