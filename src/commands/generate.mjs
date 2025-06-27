import { join } from 'path';
import consola from 'consola';
import { ensureNuxflyDir, writeFile, copyDistDir } from '../utils/filesystem.mjs';
import { validateFlyTomlExists } from '../utils/validation.mjs';
import { withErrorHandling } from '../utils/errors.mjs';
import { hasDistDir } from '../utils/config.mjs';
import { generateDockerfile, generateDockerignore } from '../templates/dockerfile.mjs';

/**
 * Generate command - creates all fly-related files in .nuxfly directory
 */
export const generate = withErrorHandling(async (args, config) => {
  consola.info('⚡ Generating deployment files...');
  
  // Validate that fly.toml exists
  validateFlyTomlExists(config);
  
  // Ensure .nuxfly directory exists
  const nuxflyDir = await ensureNuxflyDir(config);
  
  try {
    // Generate Dockerfile
    consola.info('Generating Dockerfile...');
    const dockerfileContent = generateDockerfile({
      nodeVersion: config.nodeVersion || '20',
      packageManager: detectPackageManager(),
    });
    await writeFile(join(nuxflyDir, 'Dockerfile'), dockerfileContent);
    
    // Generate .dockerignore
    consola.info('Generating .dockerignore...');
    const dockerignoreContent = generateDockerignore();
    await writeFile(join(nuxflyDir, '.dockerignore'), dockerignoreContent);
    
    // Copy dist directory if it exists
    if (hasDistDir(config)) {
      consola.info('Copying dist directory...');
      await copyDistDir(config);
    } else {
      consola.debug('No dist directory found, skipping copy');
    }
    
    consola.success('✅ All deployment files generated successfully!');
    
    // Display generated files
    displayGeneratedFiles(nuxflyDir, hasDistDir(config));
    
  } catch (error) {
    throw new Error(`Failed to generate deployment files: ${error.message}`);
  }
});

/**
 * Detect package manager from lock files
 */
function detectPackageManager() {
  const { existsSync } = require('fs');
  const cwd = process.cwd();
  
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (existsSync(join(cwd, 'yarn.lock'))) {
    return 'yarn';
  }
  return 'npm';
}

/**
 * Display list of generated files
 */
function displayGeneratedFiles(nuxflyDir, hasDistCopy) {
  const files = [
    '📄 fly.toml (configuration)',
    '🐳 Dockerfile (container image)',
    '🚫 .dockerignore (build exclusions)',
  ];
  
  if (hasDistCopy) {
    files.push('📁 dist/ (application build)');
  }
  
  consola.box({
    title: '📁 Generated files in .nuxfly/',
    message: files.join('\n'),
    style: {
      borderColor: 'cyan',
      padding: 1,
    },
  });
}