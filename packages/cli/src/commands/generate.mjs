import { join } from 'path';
import consola from 'consola';
import { ensureNuxflyDir, writeFile, copyDrizzleMigrations } from '../utils/filesystem.mjs';
import { withErrorHandling } from '../utils/errors.mjs';
import { hasDistDir, getEnvironmentSpecificFlyTomlPath } from '../utils/config.mjs';
import { buildApplication, installNuxflyDependencies } from '../utils/build.mjs';
import { generateDockerfile, generateDockerignore } from '../templates/dockerfile.mjs';
import { generateFlyToml } from '../templates/fly-toml.mjs';
import { generateDrizzleConfig, generateLitestreamConfig, generateStartScript, generateDrizzlePackageJson } from '../templates/database.mjs';

/**
 * Generate command - creates all fly-related files in .nuxfly directory
 */
export const generate = withErrorHandling(async (args, config) => {
  consola.info('⚡ Generating deployment files...');
  
  // Note: Generate command creates fly.toml, so we don't validate its existence first

  // Validate Nuxt project structure
  if (!hasDistDir(config) && !args.build) {
    consola.error('❌ No .output directory found! Please build your Nuxt application first.');
    process.exit(1);
  }

  let step = 1;
  
  // Build the application first (unless --no-build is specified)
  if (args.build) {
    consola.info(`Step ${step++}: Building application...`);
    await buildApplication({ skipBuild: !args.build });
  }
  
  // Ensure .nuxfly directory exists
  const nuxflyDir = await ensureNuxflyDir(config);
  
  try {
    // Generate environment-specific fly.toml
    consola.info(`Step ${step++}: Generating fly.toml...`);
    const flyTomlContent = generateFlyToml(config);
    const flyTomlPath = getEnvironmentSpecificFlyTomlPath() || join(process.cwd(), 'fly.toml');
    await writeFile(flyTomlPath, flyTomlContent);
    consola.success(`Generated fly.toml at: ${flyTomlPath}`);
    
    // Generate Dockerfile
    consola.info(`Step ${step++}: Generating Dockerfile...`);
    const dockerfileContent = generateDockerfile({
      nodeVersion: config.nodeVersion,
    });
    await writeFile(join(nuxflyDir, 'Dockerfile'), dockerfileContent);
    
    // Generate .dockerignore
    consola.info(`Step ${step++}: Generating .dockerignore...`);
    const dockerignoreContent = generateDockerignore();
    await writeFile(join(process.cwd(), '.dockerignore'), dockerignoreContent);
    
    // Generate database-related files
    consola.info(`Step ${step++}: Generating database configuration files...`);
    
    // Generate drizzle.config.ts
    const drizzleConfigContent = generateDrizzleConfig();
    await writeFile(join(nuxflyDir, 'drizzle.config.ts'), drizzleConfigContent);
    
    // Generate litestream.yml
    const litestreamConfigContent = generateLitestreamConfig({});
    await writeFile(join(nuxflyDir, 'litestream.yml'), litestreamConfigContent);
    
    // Generate start.sh
    const startScriptContent = generateStartScript();
    await writeFile(join(nuxflyDir, 'start.sh'), startScriptContent);
    
    // Generate package.json for drizzle-kit
    const drizzlePackageJsonContent = await generateDrizzlePackageJson();
    await writeFile(join(nuxflyDir, 'package.json'), drizzlePackageJsonContent);
    
    // Install dependencies to populate package-lock.json
    await installNuxflyDependencies(nuxflyDir);
    
    // Copy drizzle migrations from parent project
    await copyDrizzleMigrations(config);
    
    consola.success('✅ All deployment files generated successfully!');
    
    // Display generated files
    displayGeneratedFiles();

  } catch (error) {
    throw new Error(`Failed to generate deployment files: ${error.message}`);
  }
});


/**
 * Display list of generated files
 */
function displayGeneratedFiles() {
  const flyTomlPath = getEnvironmentSpecificFlyTomlPath() || 'fly.toml';
  const files = [
    `📄 ${flyTomlPath} (Fly.io configuration)`,
    '🚫 .dockerignore (build exclusions)',
    '🐳 .nuxfly/Dockerfile (container image)',
    '⚙️ .nuxfly/drizzle.config.ts (database configuration)',
    '💾 .nuxfly/litestream.yml (database backup configuration)',
    '🚀 .nuxfly/start.sh (startup script)',
    '📦 .nuxfly/package.json (drizzle-kit dependencies)',
    '🔒 .nuxfly/package-lock.json (dependency lock file)',
  ];
  
  consola.box({
    title: '📁 Generated files',
    message: files.join('\n'),
    style: {
      borderColor: 'cyan',
      padding: 1,
    },
  });
}