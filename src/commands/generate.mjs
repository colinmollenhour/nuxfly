import { join } from 'path';
import consola from 'consola';
import { ensureNuxflyDir, writeFile, copyDistDir } from '../utils/filesystem.mjs';
import { validateFlyTomlExists } from '../utils/validation.mjs';
import { withErrorHandling } from '../utils/errors.mjs';
import { hasDistDir } from '../utils/config.mjs';
import { buildApplication } from '../utils/build.mjs';
import { generateDockerfile, generateDockerignore } from '../templates/dockerfile.mjs';
import { generateFlyToml } from '../templates/fly-toml.mjs';

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
    // Generate fly.toml in project root
    consola.info('Step 2: Generating fly.toml...');
    const flyTomlContent = generateFlyToml({
      app: config.app,
      region: config.region || 'ord',
      memory: config.memory || '512mb',
      instances: config.instances || { min: 1, max: 3 },
      env: config.env || {},
      volumes: config.volumes || [],
      build: { dockerfile: '.nuxfly/Dockerfile' },
    });
    await writeFile(join(process.cwd(), 'fly.toml'), flyTomlContent);
    
    // Generate Dockerfile
    consola.info(`Step 3: Generating Dockerfile...`);
    const dockerfileContent = generateDockerfile({
      nodeVersion: config.nodeVersion,
    });
    await writeFile(join(nuxflyDir, 'Dockerfile'), dockerfileContent);
    
    // Generate .dockerignore
    consola.info('Step 4: Generating .dockerignore...');
    const dockerignoreContent = generateDockerignore();
    await writeFile(join(nuxflyDir, '.dockerignore'), dockerignoreContent);
    
    // Copy dist directory if it exists
    if (hasDistDir(config)) {
      consola.info('Step 5: Copying .output directory...');
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
    '📄 fly.toml (Fly.io configuration)',
    '🐳 Dockerfile (container image)',
    '🚫 .dockerignore (build exclusions)',
  ];
  
  if (hasDistCopy) {
    files.push('📁 .output/ (application '+(build ? 'built' : 'not built')+')');
  }
  
  consola.box({
    title: '📁 Generated files',
    message: files.join('\n'),
    style: {
      borderColor: 'cyan',
      padding: 1,
    },
  });
}