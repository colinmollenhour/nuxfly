import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Simple build script that copies files and updates shebang
function buildCLI() {
  const srcDir = join(__dirname, 'src');
  const distDir = join(__dirname, 'dist');
  
  // Create dist directory
  mkdirSync(distDir, { recursive: true });
  mkdirSync(join(distDir, 'commands'), { recursive: true });
  mkdirSync(join(distDir, 'templates'), { recursive: true });
  mkdirSync(join(distDir, 'utils'), { recursive: true });
  
  // Copy and process index.mjs
  const indexContent = readFileSync(join(srcDir, 'index.mjs'), 'utf8');
  writeFileSync(join(distDir, 'index.mjs'), indexContent);
  
  // Copy all command files
  const commands = [
    'deploy.mjs', 'generate.mjs', 'import.mjs', 
    'launch.mjs', 'proxy.mjs', 'studio.mjs'
  ];
  
  commands.forEach(cmd => {
    const content = readFileSync(join(srcDir, 'commands', cmd), 'utf8');
    writeFileSync(join(distDir, 'commands', cmd), content);
  });
  
  // Copy template files
  const templates = ['dockerfile.mjs', 'fly-toml.mjs'];
  templates.forEach(template => {
    const content = readFileSync(join(srcDir, 'templates', template), 'utf8');
    writeFileSync(join(distDir, 'templates', template), content);
  });
  
  // Copy utility files
  const utils = [
    'buckets.mjs', 'build.mjs', 'config.mjs', 
    'errors.mjs', 'filesystem.mjs', 'flyctl.mjs', 'validation.mjs'
  ];
  
  utils.forEach(util => {
    const content = readFileSync(join(srcDir, 'utils', util), 'utf8');
    writeFileSync(join(distDir, 'utils', util), content);
  });
  
  console.log('✅ CLI build complete');
}

buildCLI();