import { join } from 'path';
import consola from 'consola';
import { ensureNuxflyDir, writeFile, copyDistDir } from '../utils/filesystem.mjs';
import { validateFlyTomlExists } from '../utils/validation.mjs';
import { withErrorHandling } from '../utils/errors.mjs';
import { hasDistDir } from '../utils/config.mjs';
import { buildApplication } from '../utils/build.mjs';
import { generateDockerfile, generateDockerignore } from '../templates/dockerfile.mjs';

/**
 * Generate command - creates all fly-related files in .nuxfly directory
 */
export const generate = withErrorHandling(async (args, config) => {
  consola.info('⚡ Generating deployment files...');
  
  // Validate that fly.toml exists
  validateFlyTomlExists(config);
  
  // Build the application first (unless --no-build is specified)
  consola.info('Step 1: Building application...');
  await buildApplication({ skipBuild: !args.build });
  
  // Ensure .nuxfly directory exists
  const nuxflyDir = await ensureNuxflyDir(config);
  
  try {
    // Generate Dockerfile
    consola.info(`Step 2: Generating Dockerfile...`);
    const dockerfileContent = generateDockerfile({
      nodeVersion: config.nodeVersion,
    });
    await writeFile(join(nuxflyDir, 'Dockerfile'), dockerfileContent);
    
    // Generate .dockerignore
    consola.info('Step 3: Generating .dockerignore...');
    const dockerignoreContent = generateDockerignore();
    await writeFile(join(nuxflyDir, '.dockerignore'), dockerignoreContent);
    
    // Copy dist directory if it exists
    if (hasDistDir(config)) {
      consola.info('Step 4: Copying dist directory...');
      await copyDistDir(config);
    } else {
      consola.debug('No dist directory found, skipping copy');
    }
    
    consola.success('✅ All deployment files generated successfully!');
    
    // Display generated files
    displayGeneratedFiles(hasDistDir(config), args.build);
    
  } catch (error) {
    throw new Error(`Failed to generate deployment files: ${error.message}`);
  }
});


/**
 * Display list of generated files
 */
function displayGeneratedFiles(hasDistCopy, build) {
  const files = [
    '📄 fly.toml (configuration)',
    '🐳 Dockerfile (container image)',
    '🚫 .dockerignore (build exclusions)',
  ];
  
  if (hasDistCopy) {
    files.push('📁 .output/ (application '+(build ? 'built' : 'not built')+')');
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